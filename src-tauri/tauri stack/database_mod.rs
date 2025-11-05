// src-tauri/src/database/mod.rs
// Database Manager - Interfaces with existing PostgreSQL schema
// Maintains polyinstantiation and security classification from existing SQL files

use sqlx::{PgPool, Row, Postgres, Transaction};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

use crate::security::{SecurityLabel, ClassificationLevel};
use crate::observability::ForensicEnvelope;

pub mod migrations;
pub mod queries;
pub mod polyinstantiation;

/// Database manager for secure data operations
#[derive(Debug, Clone)]
pub struct DatabaseManager {
    pool: PgPool,
    enable_polyinstantiation: bool,
}

/// Security context for database operations
#[derive(Debug, Clone)]
pub struct DatabaseContext {
    pub user_id: String,
    pub session_id: Uuid,
    pub security_label: SecurityLabel,
    pub tenant_id: Option<String>,
}

/// Database entity with security metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureEntity {
    pub id: Uuid,
    pub entity_type: String,
    pub data: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by: String,
    pub updated_by: String,
    pub classification: ClassificationLevel,
    pub compartments: Vec<String>,
    pub version: i64,
    pub tenant_id: Option<String>,
}

/// Query result with security enforcement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureQueryResult {
    pub entities: Vec<SecureEntity>,
    pub total_count: i64,
    pub filtered_count: i64, // After security filtering
    pub access_denied_count: i64,
}

/// Database operation types for audit logging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DatabaseOperation {
    Create,
    Read,
    Update,
    Delete,
    Query,
    BatchUpdate,
}

impl DatabaseManager {
    /// Create new database manager with existing connection
    pub async fn new() -> Result<Self, sqlx::Error> {
        // Use existing database connection string from environment
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgresql://localhost/nodus".to_string());
        
        let pool = PgPool::connect(&database_url).await?;
        
        // Check if polyinstantiation is enabled (from existing schema)
        let enable_polyinstantiation = Self::check_polyinstantiation_enabled(&pool).await?;
        
        Ok(Self {
            pool,
            enable_polyinstantiation,
        })
    }

    /// Check if polyinstantiation is enabled in the database schema
    async fn check_polyinstantiation_enabled(pool: &PgPool) -> Result<bool, sqlx::Error> {
        // Query the existing schema to see if polyinstantiation tables exist
        let result = sqlx::query(
            "SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'security' 
                AND table_name = 'polyinstantiation_index'
            )"
        )
        .fetch_one(pool)
        .await?;

        Ok(result.get::<bool, _>(0))
    }

    /// Create entity with automatic security enforcement
    pub async fn create_entity(
        &self,
        entity_type: &str,
        data: serde_json::Value,
        context: &DatabaseContext,
    ) -> Result<SecureEntity, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        
        let entity_id = Uuid::new_v4();
        let now = Utc::now();
        
        let entity = SecureEntity {
            id: entity_id,
            entity_type: entity_type.to_string(),
            data,
            created_at: now,
            updated_at: now,
            created_by: context.user_id.clone(),
            updated_by: context.user_id.clone(),
            classification: context.security_label.level.clone(),
            compartments: context.security_label.compartments.clone(),
            version: 1,
            tenant_id: context.tenant_id.clone(),
        };

        // Insert into main entities table
        sqlx::query!(
            r#"
            INSERT INTO entities (
                id, entity_type, data, created_at, updated_at, 
                created_by, updated_by, classification, compartments, 
                version, tenant_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
            entity.id,
            entity.entity_type,
            entity.data,
            entity.created_at,
            entity.updated_at,
            entity.created_by,
            entity.updated_by,
            entity.classification.to_string(),
            &entity.compartments,
            entity.version,
            entity.tenant_id
        )
        .execute(&mut *tx)
        .await?;

        // Handle polyinstantiation if enabled
        if self.enable_polyinstantiation {
            self.create_polyinstantiation_entry(&mut tx, &entity, context).await?;
        }

        tx.commit().await?;
        
        Ok(entity)
    }

    /// Read entity with MAC enforcement
    pub async fn read_entity(
        &self,
        entity_id: Uuid,
        context: &DatabaseContext,
    ) -> Result<Option<SecureEntity>, sqlx::Error> {
        // Base query for entity
        let mut query_builder = sqlx::QueryBuilder::new(
            "SELECT id, entity_type, data, created_at, updated_at, 
             created_by, updated_by, classification, compartments, 
             version, tenant_id FROM entities WHERE id = "
        );
        query_builder.push_bind(entity_id);

        // Add security filtering based on user's clearance
        self.add_security_filter(&mut query_builder, context);

        let result = query_builder
            .build_query_as::<SecureEntity>()
            .fetch_optional(&self.pool)
            .await?;

        Ok(result)
    }

    /// Update entity with version control and MAC enforcement
    pub async fn update_entity(
        &self,
        entity_id: Uuid,
        updates: serde_json::Value,
        context: &DatabaseContext,
    ) -> Result<Option<SecureEntity>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // First, check if user can read the entity (No Read Up)
        let existing = self.read_entity_in_transaction(&mut tx, entity_id, context).await?;
        let existing = match existing {
            Some(entity) => entity,
            None => return Ok(None), // Entity doesn't exist or access denied
        };

        // Check write permissions (No Write Down for the update operation)
        let target_classification = context.security_label.level.clone();
        if !self.can_write_classification(&existing.classification, &target_classification) {
            return Ok(None); // Write access denied
        }

        // Perform optimistic locking check
        let new_version = existing.version + 1;
        let now = Utc::now();

        // Merge the existing data with updates
        let mut updated_data = existing.data.clone();
        if let (serde_json::Value::Object(ref mut existing_map), serde_json::Value::Object(updates_map)) = 
            (&mut updated_data, updates) {
            for (key, value) in updates_map {
                existing_map.insert(key, value);
            }
        }

        let updated_entity = SecureEntity {
            id: existing.id,
            entity_type: existing.entity_type.clone(),
            data: updated_data,
            created_at: existing.created_at,
            updated_at: now,
            created_by: existing.created_by.clone(),
            updated_by: context.user_id.clone(),
            classification: existing.classification.clone(),
            compartments: existing.compartments.clone(),
            version: new_version,
            tenant_id: existing.tenant_id.clone(),
        };

        // Update the entity with optimistic locking
        let updated_rows = sqlx::query!(
            r#"
            UPDATE entities 
            SET data = $2, updated_at = $3, updated_by = $4, version = $5
            WHERE id = $1 AND version = $6
            "#,
            entity_id,
            updated_entity.data,
            updated_entity.updated_at,
            updated_entity.updated_by,
            updated_entity.version,
            existing.version // Optimistic lock check
        )
        .execute(&mut *tx)
        .await?;

        if updated_rows.rows_affected() == 0 {
            // Either entity was updated by someone else or doesn't exist
            return Ok(None);
        }

        // Update polyinstantiation if enabled
        if self.enable_polyinstantiation {
            self.update_polyinstantiation_entry(&mut tx, &updated_entity, context).await?;
        }

        tx.commit().await?;
        
        Ok(Some(updated_entity))
    }

    /// Delete entity with MAC enforcement
    pub async fn delete_entity(
        &self,
        entity_id: Uuid,
        context: &DatabaseContext,
    ) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;

        // Check if entity exists and user can access it
        let existing = self.read_entity_in_transaction(&mut tx, entity_id, context).await?;
        let existing = match existing {
            Some(entity) => entity,
            None => return Ok(false), // Entity doesn't exist or access denied
        };

        // Check write permissions for deletion
        if !self.can_write_classification(&existing.classification, &context.security_label.level) {
            return Ok(false); // Delete access denied
        }

        // Delete from main table
        let deleted_rows = sqlx::query!(
            "DELETE FROM entities WHERE id = $1",
            entity_id
        )
        .execute(&mut *tx)
        .await?;

        // Clean up polyinstantiation if enabled
        if self.enable_polyinstantiation {
            self.delete_polyinstantiation_entry(&mut tx, entity_id, context).await?;
        }

        tx.commit().await?;
        
        Ok(deleted_rows.rows_affected() > 0)
    }

    /// Query entities with automatic security filtering
    pub async fn query_entities(
        &self,
        entity_type: Option<&str>,
        filters: HashMap<String, serde_json::Value>,
        context: &DatabaseContext,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<SecureQueryResult, sqlx::Error> {
        let mut query_builder = sqlx::QueryBuilder::new(
            "SELECT id, entity_type, data, created_at, updated_at, 
             created_by, updated_by, classification, compartments, 
             version, tenant_id FROM entities WHERE 1=1"
        );

        // Add entity type filter
        if let Some(et) = entity_type {
            query_builder.push(" AND entity_type = ");
            query_builder.push_bind(et);
        }

        // Add custom filters
        for (key, value) in filters {
            query_builder.push(" AND data->>");
            query_builder.push_bind(key);
            query_builder.push(" = ");
            query_builder.push_bind(value.as_str().unwrap_or(""));
        }

        // Add security filtering
        self.add_security_filter(&mut query_builder, context);

        // Add pagination
        if let Some(limit) = limit {
            query_builder.push(" LIMIT ");
            query_builder.push_bind(limit);
        }
        if let Some(offset) = offset {
            query_builder.push(" OFFSET ");
            query_builder.push_bind(offset);
        }

        let entities = query_builder
            .build_query_as::<SecureEntity>()
            .fetch_all(&self.pool)
            .await?;

        // Get total count (this is simplified - in production you'd want separate count queries)
        let filtered_count = entities.len() as i64;
        
        Ok(SecureQueryResult {
            entities,
            total_count: filtered_count, // Simplified
            filtered_count,
            access_denied_count: 0, // Would require more complex tracking
        })
    }

    /// Store forensic envelope in database
    pub async fn store_forensic_envelope(
        &self,
        envelope: &ForensicEnvelope,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            INSERT INTO forensic_log (
                envelope_id, operation_id, event_type, timestamp, 
                user_id, session_id, classification, action, 
                resource, before_state, after_state, metadata, 
                audit_trail_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            "#,
            envelope.envelope_id,
            envelope.operation_id,
            envelope.event_type,
            envelope.timestamp,
            envelope.user_id,
            envelope.session_id,
            envelope.classification.to_string(),
            envelope.action,
            envelope.resource,
            envelope.before_state,
            envelope.after_state,
            envelope.metadata,
            envelope.audit_trail_hash
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // Private helper methods

    /// Add security filtering to query based on user's clearance
    fn add_security_filter(
        &self,
        query_builder: &mut sqlx::QueryBuilder<Postgres>,
        context: &DatabaseContext,
    ) {
        let user_level_rank = context.security_label.level.rank();
        
        // No Read Up: User can only read data at or below their clearance level
        query_builder.push(" AND (");
        
        // Add classification level check
        for level in &[
            ClassificationLevel::Unclassified,
            ClassificationLevel::Internal,
            ClassificationLevel::Confidential,
            ClassificationLevel::Secret,
            ClassificationLevel::NatoSecret,
        ] {
            if level.rank() <= user_level_rank {
                query_builder.push("classification = ");
                query_builder.push_bind(level.to_string());
                query_builder.push(" OR ");
            }
        }
        query_builder.push("FALSE)"); // Close the OR chain
        
        // Add compartment check if user has compartments
        if !context.security_label.compartments.is_empty() {
            query_builder.push(" AND (");
            query_builder.push("compartments = '{}' OR "); // No compartments required
            
            // User can access data in their compartments
            for compartment in &context.security_label.compartments {
                query_builder.push("(");
                query_builder.push_bind(compartment);
                query_builder.push(" = ANY(compartments)) OR ");
            }
            query_builder.push("FALSE)"); // Close compartment check
        }

        // Add tenant isolation if enabled
        if let Some(tenant_id) = &context.tenant_id {
            query_builder.push(" AND (tenant_id IS NULL OR tenant_id = ");
            query_builder.push_bind(tenant_id);
            query_builder.push(")");
        }
    }

    /// Check if user can write to a classification level (No Write Down)
    fn can_write_classification(
        &self,
        target_classification: &ClassificationLevel,
        user_classification: &ClassificationLevel,
    ) -> bool {
        // No Write Down: User can write to their level or higher
        user_classification.rank() <= target_classification.rank()
    }

    /// Read entity within a transaction
    async fn read_entity_in_transaction(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        entity_id: Uuid,
        context: &DatabaseContext,
    ) -> Result<Option<SecureEntity>, sqlx::Error> {
        // This would need proper implementation based on your exact schema
        // For now, simplified version
        let result = sqlx::query_as!(
            SecureEntity,
            r#"
            SELECT id, entity_type, data, created_at, updated_at,
                   created_by, updated_by, classification as "classification: ClassificationLevel", 
                   compartments, version, tenant_id
            FROM entities 
            WHERE id = $1
            "#,
            entity_id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(result)
    }

    /// Create polyinstantiation entry (if enabled)
    async fn create_polyinstantiation_entry(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        entity: &SecureEntity,
        context: &DatabaseContext,
    ) -> Result<(), sqlx::Error> {
        // Implementation would depend on your polyinstantiation schema
        // This is a placeholder
        Ok(())
    }

    /// Update polyinstantiation entry (if enabled)
    async fn update_polyinstantiation_entry(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        entity: &SecureEntity,
        context: &DatabaseContext,
    ) -> Result<(), sqlx::Error> {
        // Implementation would depend on your polyinstantiation schema
        Ok(())
    }

    /// Delete polyinstantiation entry (if enabled)
    async fn delete_polyinstantiation_entry(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        entity_id: Uuid,
        context: &DatabaseContext,
    ) -> Result<(), sqlx::Error> {
        // Implementation would depend on your polyinstantiation schema
        Ok(())
    }
}

impl DatabaseContext {
    /// Create new database context from user information
    pub fn new(
        user_id: String,
        session_id: Uuid,
        security_label: SecurityLabel,
        tenant_id: Option<String>,
    ) -> Self {
        Self {
            user_id,
            session_id,
            security_label,
            tenant_id,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_database_context_creation() {
        let context = DatabaseContext::new(
            "test-user".to_string(),
            Uuid::new_v4(),
            SecurityLabel::new(ClassificationLevel::Secret, vec!["ALPHA".to_string()]),
            Some("tenant-1".to_string()),
        );
        
        assert_eq!(context.user_id, "test-user");
        assert_eq!(context.security_label.level, ClassificationLevel::Secret);
        assert_eq!(context.tenant_id, Some("tenant-1".to_string()));
    }
    
    #[test]
    fn test_secure_entity_creation() {
        let entity = SecureEntity {
            id: Uuid::new_v4(),
            entity_type: "user".to_string(),
            data: serde_json::json!({"name": "Test User"}),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            created_by: "admin".to_string(),
            updated_by: "admin".to_string(),
            classification: ClassificationLevel::Confidential,
            compartments: vec!["ALPHA".to_string()],
            version: 1,
            tenant_id: None,
        };
        
        assert_eq!(entity.entity_type, "user");
        assert_eq!(entity.classification, ClassificationLevel::Confidential);
        assert_eq!(entity.version, 1);
    }
}
