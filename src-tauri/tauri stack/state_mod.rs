// src-tauri/src/state/mod.rs
// Application State Management - Replaces HybridStateManager.js
// Manages the core application state with security and observability integration

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;

use crate::security::{SecurityManager, SecurityLabel, ClassificationLevel};
use crate::observability::{ForensicLogger, MetricsRegistry, ActionDispatcher};
use crate::database::DatabaseManager;
use crate::license::LicenseManager;

/// Core application state (replaces HybridStateManager.js)
#[derive(Debug)]
pub struct AppState {
    // Core managers (replace JS manager singletons)
    pub security_manager: SecurityManager,
    pub db_manager: DatabaseManager,
    pub metrics_registry: MetricsRegistry,
    pub forensic_logger: ForensicLogger,
    pub action_dispatcher: ActionDispatcher,
    pub license_manager: LicenseManager,
    
    // Application state
    pub user_contexts: RwLock<HashMap<String, UserContext>>,
    pub active_sessions: RwLock<HashMap<Uuid, SessionState>>,
    pub system_config: RwLock<SystemConfig>,
    pub initialized: bool,
}

/// User context for security decisions (replaces JS SecurityContext)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    pub user_id: String,
    pub clearance_level: ClassificationLevel,
    pub compartments: Vec<String>,
    pub session_id: Uuid,
    pub login_time: chrono::DateTime<chrono::Utc>,
    pub permissions: Vec<String>,
}

/// Session state tracking (replaces JS session management)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub user_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
    pub security_label: SecurityLabel,
    pub is_active: bool,
    pub workspace_data: serde_json::Value,
}

/// System configuration (replaces JS config management)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfig {
    pub performance_mode: PerformanceMode,
    pub observability_level: ObservabilityLevel,
    pub license_tier: LicenseTier,
    pub security_settings: SecuritySettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PerformanceMode {
    Normal,
    HighPerformance,
    PowerSaver,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ObservabilityLevel {
    Minimal,     // Community tier
    Standard,    // Enterprise tier
    Full,        // Defense tier
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LicenseTier {
    Community,
    Enterprise,
    Defense,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySettings {
    pub enable_mac_enforcement: bool,
    pub audit_all_operations: bool,
    pub require_signed_plugins: bool,
    pub enable_classification_crypto: bool,
}

impl AppState {
    /// Create new application state (replaces HybridStateManager constructor)
    pub fn new(
        security_manager: SecurityManager,
        db_manager: DatabaseManager,
        metrics_registry: MetricsRegistry,
        forensic_logger: ForensicLogger,
        action_dispatcher: ActionDispatcher,
        license_manager: LicenseManager,
    ) -> Self {
        Self {
            security_manager,
            db_manager,
            metrics_registry,
            forensic_logger,
            action_dispatcher,
            license_manager,
            user_contexts: RwLock::new(HashMap::new()),
            active_sessions: RwLock::new(HashMap::new()),
            system_config: RwLock::new(SystemConfig::default()),
            initialized: false,
        }
    }

    /// Set user context for security decisions (replaces JS setUserContext)
    pub async fn set_user_context(&self, user_context: UserContext) -> Result<(), String> {
        // Security audit for context change
        self.forensic_logger.log_security_event(
            "user.context.set",
            &format!("User {} context established with clearance {:?}", 
                user_context.user_id, user_context.clearance_level),
            &user_context.user_id,
        ).await.map_err(|e| format!("Failed to log security event: {}", e))?;

        // Update user context
        let mut contexts = self.user_contexts.write().await;
        contexts.insert(user_context.user_id.clone(), user_context);

        Ok(())
    }

    /// Get user context (replaces JS getUserContext)
    pub async fn get_user_context(&self, user_id: &str) -> Option<UserContext> {
        let contexts = self.user_contexts.read().await;
        contexts.get(user_id).cloned()
    }

    /// Create new session (replaces JS session management)
    pub async fn create_session(&self, user_id: String, security_label: SecurityLabel) -> Result<Uuid, String> {
        let session_id = Uuid::new_v4();
        let now = chrono::Utc::now();

        let session = SessionState {
            user_id: user_id.clone(),
            created_at: now,
            last_activity: now,
            security_label,
            is_active: true,
            workspace_data: serde_json::Value::Object(serde_json::Map::new()),
        };

        // Log session creation
        self.forensic_logger.log_security_event(
            "session.create",
            &format!("Session {} created for user {}", session_id, user_id),
            &user_id,
        ).await.map_err(|e| format!("Failed to log session creation: {}", e))?;

        // Store session
        let mut sessions = self.active_sessions.write().await;
        sessions.insert(session_id, session);

        Ok(session_id)
    }

    /// Update system configuration (replaces JS config updates)
    pub async fn update_system_config<F>(&self, updater: F) -> Result<(), String>
    where
        F: FnOnce(&mut SystemConfig),
    {
        let mut config = self.system_config.write().await;
        updater(&mut *config);

        // Log configuration change
        self.forensic_logger.log_system_event(
            "system.config.update",
            "System configuration updated",
            "system",
        ).await.map_err(|e| format!("Failed to log config update: {}", e))?;

        Ok(())
    }

    /// Get current license tier (replaces JS license detection)
    pub async fn get_license_tier(&self) -> LicenseTier {
        let config = self.system_config.read().await;
        config.license_tier.clone()
    }

    /// Check if feature is available in current license (replaces JS license.hasFeature)
    pub async fn has_feature(&self, feature: &str) -> bool {
        self.license_manager.has_feature(feature).await
    }
}

impl Default for SystemConfig {
    fn default() -> Self {
        Self {
            performance_mode: PerformanceMode::Normal,
            observability_level: ObservabilityLevel::Standard,
            license_tier: LicenseTier::Community,
            security_settings: SecuritySettings {
                enable_mac_enforcement: true,
                audit_all_operations: false, // Community default
                require_signed_plugins: false,
                enable_classification_crypto: false,
            },
        }
    }
}

impl UserContext {
    /// Create new user context with security label
    pub fn new(
        user_id: String,
        clearance_level: ClassificationLevel,
        compartments: Vec<String>,
        permissions: Vec<String>,
    ) -> Self {
        Self {
            user_id,
            clearance_level,
            compartments,
            session_id: Uuid::new_v4(),
            login_time: chrono::Utc::now(),
            permissions,
        }
    }

    /// Get security label for this user context
    pub fn to_security_label(&self) -> SecurityLabel {
        SecurityLabel::new(self.clearance_level.clone(), self.compartments.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::ClassificationLevel;

    #[tokio::test]
    async fn test_user_context_management() {
        // This would require proper initialization in real tests
        // For now, showing the pattern
        
        let user_context = UserContext::new(
            "test-user".to_string(),
            ClassificationLevel::Secret,
            vec!["ALPHA".to_string()],
            vec!["read".to_string(), "write".to_string()],
        );

        assert_eq!(user_context.user_id, "test-user");
        assert_eq!(user_context.clearance_level, ClassificationLevel::Secret);
        assert!(user_context.compartments.contains(&"ALPHA".to_string()));
    }

    #[test]
    fn test_security_label_conversion() {
        let user_context = UserContext::new(
            "test-user".to_string(),
            ClassificationLevel::Confidential,
            vec!["BETA".to_string(), "GAMMA".to_string()],
            vec!["read".to_string()],
        );

        let security_label = user_context.to_security_label();
        assert_eq!(security_label.level, ClassificationLevel::Confidential);
        assert_eq!(security_label.compartments.len(), 2);
    }
}
