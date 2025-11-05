// src-tauri/src/commands/data.rs
// Data Operation Command Handlers - Tauri Commands for Data Operations
// Provides secure frontend access to database and state management with automatic observability

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use serde_json::Value;

use crate::database::{DatabaseManager, EntityOperation, EntityQuery};
use crate::state::{AppState, HybridStateManager};
use crate::security::{ClassificationLevel, SecurityContext};
use crate::observability::{ObservabilityContext, ActionDispatcher, AsyncOrchestrator, OperationConfig};
use crate::error::AppError;

/// Tauri command for entity read operations with automatic observability
#[tauri::command]
pub async fn read_entity(
    session_id: String,
    entity_type: String,
    entity_id: String,
    classification: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<EntityResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Parse classification level
    let classification_level = classification
        .map(|c| parse_classification(&c))
        .transpose()?
        .unwrap_or(ClassificationLevel::Internal);

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "data",
        "read_entity",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Execute through action dispatcher for automatic observability
    let action_context = crate::observability::ActionContext {
        user_id: security_context.user_id.clone(),
        session_id: session_uuid,
        security_label: security_context.security_label.clone(),
        tenant_id: security_context.tenant_id.clone(),
        request_id: Uuid::new_v4(),
        source_ip: None,
        user_agent: None,
    };

    let payload = serde_json::json!({
        "entity_type": entity_type,
        "entity_id": entity_id,
        "classification": classification_level
    });

    let action_result = app_state.action_dispatcher.dispatch(
        "data.read_entity",
        payload,
        action_context,
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    if !action_result.success {
        return Err(action_result.error.unwrap_or("Read operation failed".to_string()));
    }

    // Extract entity data from action result
    let entity_data = action_result.data
        .ok_or("No data returned from read operation")?;

    Ok(EntityResult {
        entity_id: entity_id.clone(),
        entity_type: entity_type.clone(),
        data: entity_data,
        classification: classification_level.to_string(),
        last_modified: chrono::Utc::now(), // TODO: Get actual timestamp
        metadata: EntityMetadata {
            operation_id: action_result.observability_metadata.operation_id,
            user_id: security_context.user_id,
            session_id: session_id,
            audit_logged: action_result.observability_metadata.audit_logged,
            execution_time_ms: action_result.execution_time_ms,
        },
    })
}

/// Tauri command for entity write operations with automatic observability
#[tauri::command]
pub async fn write_entity(
    session_id: String,
    entity_type: String,
    entity_id: Option<String>,
    entity_data: Value,
    classification: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<EntityResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Parse classification level
    let classification_level = classification
        .map(|c| parse_classification(&c))
        .transpose()?
        .unwrap_or(ClassificationLevel::Internal);

    // Generate entity ID if not provided
    let final_entity_id = entity_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "data",
        "write_entity",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Execute through action dispatcher for automatic observability
    let action_context = crate::observability::ActionContext {
        user_id: security_context.user_id.clone(),
        session_id: session_uuid,
        security_label: security_context.security_label.clone(),
        tenant_id: security_context.tenant_id.clone(),
        request_id: Uuid::new_v4(),
        source_ip: None,
        user_agent: None,
    };

    let payload = serde_json::json!({
        "entity_type": entity_type,
        "entity_id": final_entity_id,
        "entity_data": entity_data,
        "classification": classification_level
    });

    let action_result = app_state.action_dispatcher.dispatch(
        "data.write_entity",
        payload,
        action_context,
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    if !action_result.success {
        return Err(action_result.error.unwrap_or("Write operation failed".to_string()));
    }

    // Extract entity data from action result
    let result_data = action_result.data
        .ok_or("No data returned from write operation")?;

    Ok(EntityResult {
        entity_id: final_entity_id.clone(),
        entity_type: entity_type.clone(),
        data: result_data,
        classification: classification_level.to_string(),
        last_modified: chrono::Utc::now(),
        metadata: EntityMetadata {
            operation_id: action_result.observability_metadata.operation_id,
            user_id: security_context.user_id,
            session_id: session_id,
            audit_logged: action_result.observability_metadata.audit_logged,
            execution_time_ms: action_result.execution_time_ms,
        },
    })
}

/// Tauri command for entity delete operations with automatic observability
#[tauri::command]
pub async fn delete_entity(
    session_id: String,
    entity_type: String,
    entity_id: String,
    classification: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<DeleteResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Parse classification level
    let classification_level = classification
        .map(|c| parse_classification(&c))
        .transpose()?
        .unwrap_or(ClassificationLevel::Internal);

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "data",
        "delete_entity",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Execute through action dispatcher for automatic observability
    let action_context = crate::observability::ActionContext {
        user_id: security_context.user_id.clone(),
        session_id: session_uuid,
        security_label: security_context.security_label.clone(),
        tenant_id: security_context.tenant_id.clone(),
        request_id: Uuid::new_v4(),
        source_ip: None,
        user_agent: None,
    };

    let payload = serde_json::json!({
        "entity_type": entity_type,
        "entity_id": entity_id,
        "classification": classification_level
    });

    let action_result = app_state.action_dispatcher.dispatch(
        "data.delete_entity",
        payload,
        action_context,
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    if !action_result.success {
        return Err(action_result.error.unwrap_or("Delete operation failed".to_string()));
    }

    Ok(DeleteResult {
        entity_id: entity_id.clone(),
        entity_type: entity_type.clone(),
        deleted: true,
        deleted_at: chrono::Utc::now(),
        metadata: EntityMetadata {
            operation_id: action_result.observability_metadata.operation_id,
            user_id: security_context.user_id,
            session_id: session_id,
            audit_logged: action_result.observability_metadata.audit_logged,
            execution_time_ms: action_result.execution_time_ms,
        },
    })
}

/// Tauri command for querying entities with automatic observability
#[tauri::command]
pub async fn query_entities(
    session_id: String,
    entity_type: String,
    query_params: QueryParams,
    classification: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<QueryResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Parse classification level
    let classification_level = classification
        .map(|c| parse_classification(&c))
        .transpose()?
        .unwrap_or(ClassificationLevel::Internal);

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "data",
        "query_entities",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Execute through async orchestrator for complex queries
    let operation_runner = app_state.async_orchestrator.create_runner(
        "query_entities",
        &security_context.user_id,
        session_uuid,
        classification_level.clone(),
    ).await;

    let config = OperationConfig {
        timeout_ms: Some(30000), // 30 second timeout for queries
        retries: Some(1), // Single retry for queries
        performance_budget_ms: Some(5000), // 5 second performance budget
        priority: crate::observability::OperationPriority::Normal,
        resource_limits: None,
        classification: Some(classification_level.clone()),
        tags: HashMap::new(),
    };

    let operation_result = operation_runner.run(
        || async {
            // Build query from parameters
            let query = EntityQuery {
                filters: query_params.filters.unwrap_or_default(),
                sort_by: query_params.sort_by,
                sort_order: query_params.sort_order.unwrap_or("asc".to_string()),
                limit: query_params.limit.unwrap_or(100),
                offset: query_params.offset.unwrap_or(0),
                include_metadata: query_params.include_metadata.unwrap_or(true),
            };

            // Execute query through database manager
            app_state.database_manager.query_entities(&entity_type, &query, &security_context.security_label)
                .await
                .map_err(|e| crate::observability::OrchestrationError::ExecutionFailed(e.to_string()))
        },
        Some(config),
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    let entities = operation_result.value;

    Ok(QueryResult {
        entities: entities.into_iter().map(|entity| EntityResult {
            entity_id: entity.id,
            entity_type: entity_type.clone(),
            data: entity.data,
            classification: entity.classification.map(|c| c.to_string())
                .unwrap_or_else(|| classification_level.to_string()),
            last_modified: entity.updated_at.unwrap_or_else(chrono::Utc::now),
            metadata: EntityMetadata {
                operation_id: operation_result.execution_metadata.operation_id,
                user_id: security_context.user_id.clone(),
                session_id: session_id.clone(),
                audit_logged: operation_result.execution_metadata.observability_applied,
                execution_time_ms: operation_result.execution_metadata.duration_ms,
            },
        }).collect(),
        total_count: entities.len() as u64, // TODO: Get actual total count
        has_more: false, // TODO: Implement pagination logic
        execution_metadata: QueryExecutionMetadata {
            duration_ms: operation_result.execution_metadata.duration_ms,
            retry_attempts: operation_result.execution_metadata.retry_attempts,
            performance_budget_status: operation_result.execution_metadata.performance_budget_status,
            resource_usage: ResourceUsageInfo {
                cpu_time_ms: 0, // TODO: Implement resource tracking
                memory_bytes: 0,
                io_operations: 0,
            },
        },
    })
}

/// Tauri command for batch operations with automatic observability
#[tauri::command]
pub async fn batch_operation(
    session_id: String,
    operations: Vec<BatchOperationRequest>,
    app_state: tauri::State<'_, AppState>,
) -> Result<BatchOperationResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "data",
        "batch_operation",
        ClassificationLevel::Internal, // Will be determined per operation
        &security_context.user_id,
        session_uuid,
    );

    // Execute through async orchestrator for batch processing
    let operation_runner = app_state.async_orchestrator.create_runner(
        "batch_operation",
        &security_context.user_id,
        session_uuid,
        ClassificationLevel::Internal,
    ).await;

    let config = OperationConfig {
        timeout_ms: Some(120000), // 2 minute timeout for batch operations
        retries: Some(1),
        performance_budget_ms: Some(30000), // 30 second performance budget
        priority: crate::observability::OperationPriority::Low, // Batch operations are lower priority
        resource_limits: None,
        classification: Some(ClassificationLevel::Internal),
        tags: HashMap::new(),
    };

    let operation_result = operation_runner.run(
        || async {
            let mut results = Vec::new();
            let mut success_count = 0;
            let mut failure_count = 0;

            for (index, operation) in operations.iter().enumerate() {
                let classification_level = operation.classification
                    .as_ref()
                    .map(|c| parse_classification(c))
                    .transpose()
                    .map_err(|e| crate::observability::OrchestrationError::ExecutionFailed(e))?
                    .unwrap_or(ClassificationLevel::Internal);

                // Execute individual operation
                let result = match &operation.operation_type[..] {
                    "read" => {
                        let entity_id = operation.entity_id.as_ref()
                            .ok_or(crate::observability::OrchestrationError::ExecutionFailed(
                                "Entity ID required for read operation".to_string()
                            ))?;
                        
                        match app_state.database_manager.read_entity(
                            &operation.entity_type,
                            entity_id,
                            &security_context.security_label,
                        ).await {
                            Ok(entity) => BatchOperationItemResult {
                                index,
                                success: true,
                                entity_id: entity_id.clone(),
                                entity_type: operation.entity_type.clone(),
                                data: Some(entity.data),
                                error: None,
                            },
                            Err(e) => BatchOperationItemResult {
                                index,
                                success: false,
                                entity_id: entity_id.clone(),
                                entity_type: operation.entity_type.clone(),
                                data: None,
                                error: Some(e.to_string()),
                            },
                        }
                    },
                    "write" => {
                        let entity_data = operation.entity_data.as_ref()
                            .ok_or(crate::observability::OrchestrationError::ExecutionFailed(
                                "Entity data required for write operation".to_string()
                            ))?;
                        let entity_id = operation.entity_id.clone()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        
                        match app_state.database_manager.write_entity(
                            &operation.entity_type,
                            &entity_id,
                            entity_data,
                            &security_context.security_label,
                        ).await {
                            Ok(entity) => BatchOperationItemResult {
                                index,
                                success: true,
                                entity_id: entity_id.clone(),
                                entity_type: operation.entity_type.clone(),
                                data: Some(entity.data),
                                error: None,
                            },
                            Err(e) => BatchOperationItemResult {
                                index,
                                success: false,
                                entity_id: entity_id.clone(),
                                entity_type: operation.entity_type.clone(),
                                data: None,
                                error: Some(e.to_string()),
                            },
                        }
                    },
                    "delete" => {
                        let entity_id = operation.entity_id.as_ref()
                            .ok_or(crate::observability::OrchestrationError::ExecutionFailed(
                                "Entity ID required for delete operation".to_string()
                            ))?;
                        
                        match app_state.database_manager.delete_entity(
                            &operation.entity_type,
                            entity_id,
                            &security_context.security_label,
                        ).await {
                            Ok(_) => BatchOperationItemResult {
                                index,
                                success: true,
                                entity_id: entity_id.clone(),
                                entity_type: operation.entity_type.clone(),
                                data: None,
                                error: None,
                            },
                            Err(e) => BatchOperationItemResult {
                                index,
                                success: false,
                                entity_id: entity_id.clone(),
                                entity_type: operation.entity_type.clone(),
                                data: None,
                                error: Some(e.to_string()),
                            },
                        }
                    },
                    _ => BatchOperationItemResult {
                        index,
                        success: false,
                        entity_id: operation.entity_id.clone().unwrap_or_default(),
                        entity_type: operation.entity_type.clone(),
                        data: None,
                        error: Some(format!("Unsupported operation type: {}", operation.operation_type)),
                    },
                };

                if result.success {
                    success_count += 1;
                } else {
                    failure_count += 1;
                }

                results.push(result);
            }

            Ok(BatchOperationData {
                results,
                success_count,
                failure_count,
            })
        },
        Some(config),
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    let batch_data = operation_result.value;

    Ok(BatchOperationResult {
        total_operations: operations.len(),
        successful_operations: batch_data.success_count,
        failed_operations: batch_data.failure_count,
        results: batch_data.results,
        execution_metadata: BatchExecutionMetadata {
            duration_ms: operation_result.execution_metadata.duration_ms,
            retry_attempts: operation_result.execution_metadata.retry_attempts,
            performance_budget_status: operation_result.execution_metadata.performance_budget_status,
            resource_usage: ResourceUsageInfo {
                cpu_time_ms: 0, // TODO: Implement resource tracking
                memory_bytes: 0,
                io_operations: batch_data.results.len() as u64,
            },
        },
    })
}

/// Tauri command for getting state information
#[tauri::command]
pub async fn get_state_info(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<StateInfo, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get state information
    let state_info = app_state.hybrid_state_manager.get_state_info().await;

    Ok(StateInfo {
        total_entities: state_info.total_entities,
        active_sessions: state_info.active_sessions,
        cache_hit_ratio: state_info.cache_hit_ratio,
        memory_usage_mb: state_info.memory_usage_bytes / (1024 * 1024),
        database_connections: state_info.database_connections,
        last_sync: state_info.last_sync,
        performance_metrics: PerformanceMetrics {
            avg_query_time_ms: state_info.avg_query_time_ms,
            avg_write_time_ms: state_info.avg_write_time_ms,
            operations_per_second: state_info.operations_per_second,
            error_rate: state_info.error_rate,
        },
    })
}

// Helper functions

fn parse_classification(classification: &str) -> Result<ClassificationLevel, String> {
    match classification.to_uppercase().as_str() {
        "UNCLASSIFIED" => Ok(ClassificationLevel::Unclassified),
        "INTERNAL" => Ok(ClassificationLevel::Internal),
        "CONFIDENTIAL" => Ok(ClassificationLevel::Confidential),
        "SECRET" => Ok(ClassificationLevel::Secret),
        "NATO_SECRET" => Ok(ClassificationLevel::NatoSecret),
        _ => Err(format!("Invalid classification level: {}", classification)),
    }
}

// Request/Response types for Tauri commands

#[derive(Debug, Serialize, Deserialize)]
pub struct EntityResult {
    pub entity_id: String,
    pub entity_type: String,
    pub data: Value,
    pub classification: String,
    pub last_modified: chrono::DateTime<chrono::Utc>,
    pub metadata: EntityMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntityMetadata {
    pub operation_id: String,
    pub user_id: String,
    pub session_id: String,
    pub audit_logged: bool,
    pub execution_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteResult {
    pub entity_id: String,
    pub entity_type: String,
    pub deleted: bool,
    pub deleted_at: chrono::DateTime<chrono::Utc>,
    pub metadata: EntityMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryParams {
    pub filters: Option<HashMap<String, Value>>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub include_metadata: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub entities: Vec<EntityResult>,
    pub total_count: u64,
    pub has_more: bool,
    pub execution_metadata: QueryExecutionMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryExecutionMetadata {
    pub duration_ms: u64,
    pub retry_attempts: u32,
    pub performance_budget_status: String,
    pub resource_usage: ResourceUsageInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResourceUsageInfo {
    pub cpu_time_ms: u64,
    pub memory_bytes: u64,
    pub io_operations: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOperationRequest {
    pub operation_type: String, // "read", "write", "delete"
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub entity_data: Option<Value>,
    pub classification: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOperationResult {
    pub total_operations: usize,
    pub successful_operations: usize,
    pub failed_operations: usize,
    pub results: Vec<BatchOperationItemResult>,
    pub execution_metadata: BatchExecutionMetadata,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOperationItemResult {
    pub index: usize,
    pub success: bool,
    pub entity_id: String,
    pub entity_type: String,
    pub data: Option<Value>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchExecutionMetadata {
    pub duration_ms: u64,
    pub retry_attempts: u32,
    pub performance_budget_status: String,
    pub resource_usage: ResourceUsageInfo,
}

#[derive(Debug)]
struct BatchOperationData {
    pub results: Vec<BatchOperationItemResult>,
    pub success_count: usize,
    pub failure_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StateInfo {
    pub total_entities: u64,
    pub active_sessions: u32,
    pub cache_hit_ratio: f64,
    pub memory_usage_mb: u64,
    pub database_connections: u32,
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
    pub performance_metrics: PerformanceMetrics,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub avg_query_time_ms: f64,
    pub avg_write_time_ms: f64,
    pub operations_per_second: f64,
    pub error_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_classification() {
        assert!(matches!(
            parse_classification("CONFIDENTIAL"),
            Ok(ClassificationLevel::Confidential)
        ));
        
        assert!(parse_classification("INVALID").is_err());
    }

    #[test]
    fn test_query_params_serialization() {
        let params = QueryParams {
            filters: Some(HashMap::new()),
            sort_by: Some("created_at".to_string()),
            sort_order: Some("desc".to_string()),
            limit: Some(50),
            offset: Some(0),
            include_metadata: Some(true),
        };
        
        let serialized = serde_json::to_string(&params).unwrap();
        let deserialized: QueryParams = serde_json::from_str(&serialized).unwrap();
        
        assert_eq!(params.limit, deserialized.limit);
        assert_eq!(params.sort_by, deserialized.sort_by);
    }

    #[test]
    fn test_batch_operation_request() {
        let request = BatchOperationRequest {
            operation_type: "write".to_string(),
            entity_type: "document".to_string(),
            entity_id: Some("doc-123".to_string()),
            entity_data: Some(serde_json::json!({"title": "Test Document"})),
            classification: Some("INTERNAL".to_string()),
        };
        
        assert_eq!(request.operation_type, "write");
        assert!(request.entity_data.is_some());
    }
}
