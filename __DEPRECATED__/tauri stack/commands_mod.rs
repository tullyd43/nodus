// src-tauri/src/commands/mod.rs
// Command Module - Tauri Command Handlers with Automatic Observability
// Provides secure frontend access to backend functionality through detailed command handlers

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;

use crate::state::AppState;
use crate::observability::ObservabilityContext;
use crate::security::{SecurityLabel, ClassificationLevel};
use crate::error::AppError;

// Command modules with detailed implementations
pub mod security;
pub mod data;
pub mod observability;
pub mod license;

// Re-export all command functions for Tauri registration
pub use security::*;
pub use data::*;
pub use observability::*;
pub use license::*;

type AppStateType = Arc<RwLock<AppState>>;

/// Generic command result with automatic observability data
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
    pub observability: ObservabilityMetadata,
}

/// Observability metadata returned with every command
#[derive(Debug, Serialize, Deserialize)]
pub struct ObservabilityMetadata {
    pub operation_id: String,
    pub duration_ms: u64,
    pub classification: String,
    pub audit_logged: bool,
    pub metrics_recorded: bool,
    pub performance_budget_status: String,
}

/// Entity operation request (replaces JS ActionDispatcher entity operations)
#[derive(Debug, Deserialize)]
pub struct EntityOperation {
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub data: serde_json::Value,
    pub user_id: String,
    pub session_id: String,
}

/// Async operation request (replaces JS AsyncOrchestrator operations)
#[derive(Debug, Deserialize)]
pub struct AsyncOperation {
    pub operation_name: String,
    pub operation_type: String,
    pub parameters: serde_json::Value,
    pub user_id: String,
    pub session_id: String,
    pub timeout_ms: Option<u64>,
    pub retries: Option<u32>,
}

/// Storage operation request (replaces direct storage calls)
#[derive(Debug, Deserialize)]
pub struct StorageOperation {
    pub operation: String, // "get", "put", "delete", "query"
    pub key: String,
    pub value: Option<serde_json::Value>,
    pub classification: String,
    pub user_id: String,
    pub session_id: String,
}

/// UI action request (replaces declarative HTML actions)
#[derive(Debug, Deserialize)]
pub struct UIAction {
    pub action_type: String,
    pub target: String,
    pub payload: serde_json::Value,
    pub user_id: String,
    pub session_id: String,
}

/// Macro for automatic observability wrapper (replaces JS execution gateways)
macro_rules! with_observability {
    ($app_state:expr, $context:expr, $budget:expr, $operation:expr) => {{
        let start_time = std::time::Instant::now();
        
        // Create observability context
        let obs_context = $context;
        
        // Execute operation with automatic instrumentation
        let result = {
            let state = $app_state.read().await;
            let instrumentation = AutomaticInstrumentation::new(&state);
            
            // Check if instrumentation is needed (policy decision)
            let decision = instrumentation.should_instrument(&obs_context).await;
            
            if decision.enabled {
                if decision.audit_required {
                    // Automatic audit logging
                    state.forensic_logger.log_operation_start(&obs_context).await?;
                }
                
                if decision.metrics_enabled {
                    // Automatic metrics
                    state.metrics_registry.record_operation_start(&obs_context).await;
                }
            }
            
            // Execute the actual operation
            let op_result = $operation.await;
            
            if decision.enabled {
                if decision.audit_required {
                    // Log operation completion
                    state.forensic_logger.log_operation_end(&obs_context, &op_result).await?;
                }
                
                if decision.metrics_enabled {
                    let duration = start_time.elapsed();
                    state.metrics_registry.record_operation_end(&obs_context, duration).await;
                }
            }
            
            op_result
        };
        
        let duration = start_time.elapsed();
        
        // Check performance budget
        let budget_status = $budget.check_budget(duration.as_millis() as u64);
        
        // Create result with observability metadata
        match result {
            Ok(data) => CommandResult {
                success: true,
                data: Some(data),
                error: None,
                observability: ObservabilityMetadata {
                    operation_id: obs_context.operation_id.to_string(),
                    duration_ms: duration.as_millis() as u64,
                    classification: format!("{:?}", obs_context.classification),
                    audit_logged: true, // Simplified for this example
                    metrics_recorded: true,
                    performance_budget_status: match budget_status {
                        crate::observability::BudgetResult::WithinBudget => "OK".to_string(),
                        crate::observability::BudgetResult::Exceeded { budget, actual } => 
                            format!("EXCEEDED: {}ms > {}ms", actual, budget),
                        crate::observability::BudgetResult::CriticalExceeded { budget, actual } => 
                            format!("CRITICAL: {}ms > {}ms", actual, budget),
                    },
                },
            },
            Err(error) => CommandResult {
                success: false,
                data: None,
                error: Some(error.to_string()),
                observability: ObservabilityMetadata {
                    operation_id: obs_context.operation_id.to_string(),
                    duration_ms: duration.as_millis() as u64,
                    classification: format!("{:?}", obs_context.classification),
                    audit_logged: true,
                    metrics_recorded: true,
                    performance_budget_status: "ERROR".to_string(),
                },
            },
        }
    }};
}

/// Generic entity operation (replaces ActionDispatcher.dispatch)
#[tauri::command]
pub async fn execute_entity_operation(
    request: EntityOperation,
    app_state: State<'_, AppStateType>,
) -> Result<CommandResult<serde_json::Value>, String> {
    let context = ObservabilityContext::new(
        "entity",
        &request.operation,
        ClassificationLevel::Confidential, // Default, should be determined by policy
        &request.user_id,
        Uuid::parse_str(&request.session_id).map_err(|e| e.to_string())?,
    );

    let budget = PerformanceBudget::new(5, "entity_operation", false); // 5ms budget

    let result = with_observability!(
        app_state,
        context,
        budget,
        async {
            let state = app_state.read().await;
            
            // Route to appropriate entity handler based on operation
            match request.operation.as_str() {
                "create" => {
                    // Entity creation logic here
                    Ok(serde_json::json!({
                        "entity_id": request.entity_id,
                        "status": "created",
                        "timestamp": chrono::Utc::now()
                    }))
                },
                "update" => {
                    // Entity update logic here
                    Ok(serde_json::json!({
                        "entity_id": request.entity_id,
                        "status": "updated",
                        "timestamp": chrono::Utc::now()
                    }))
                },
                "delete" => {
                    // Entity deletion logic here
                    Ok(serde_json::json!({
                        "entity_id": request.entity_id,
                        "status": "deleted",
                        "timestamp": chrono::Utc::now()
                    }))
                },
                _ => Err(format!("Unknown entity operation: {}", request.operation))
            }
        }
    );

    Ok(result)
}

/// Async operation execution (replaces AsyncOrchestrator.run)
#[tauri::command]
pub async fn execute_async_operation(
    request: AsyncOperation,
    app_state: State<'_, AppStateType>,
) -> Result<CommandResult<serde_json::Value>, String> {
    let context = ObservabilityContext::new(
        "async",
        &request.operation_name,
        ClassificationLevel::Internal, // Should be determined by operation type
        &request.user_id,
        Uuid::parse_str(&request.session_id).map_err(|e| e.to_string())?,
    );

    let budget = PerformanceBudget::new(
        request.timeout_ms.unwrap_or(30000), 
        &request.operation_name, 
        true
    );

    let result = with_observability!(
        app_state,
        context,
        budget,
        async {
            let state = app_state.read().await;
            
            // Route to appropriate async handler based on operation type
            match request.operation_type.as_str() {
                "data_processing" => {
                    // Simulate heavy data processing
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    Ok(serde_json::json!({
                        "operation": request.operation_name,
                        "result": "processed",
                        "processed_items": 1000
                    }))
                },
                "file_operation" => {
                    // File processing logic
                    Ok(serde_json::json!({
                        "operation": request.operation_name,
                        "result": "file_processed",
                        "size": 1024
                    }))
                },
                "network_request" => {
                    // Network operation logic (with CDS transport)
                    Ok(serde_json::json!({
                        "operation": request.operation_name,
                        "result": "network_success",
                        "response_time": 250
                    }))
                },
                _ => Err(format!("Unknown async operation type: {}", request.operation_type))
            }
        }
    );

    Ok(result)
}

/// Storage operation with automatic observability (replaces direct storage access)
#[tauri::command]
pub async fn execute_storage_operation(
    request: StorageOperation,
    app_state: State<'_, AppStateType>,
) -> Result<CommandResult<serde_json::Value>, String> {
    let classification = match request.classification.as_str() {
        "public" => ClassificationLevel::Unclassified,
        "internal" => ClassificationLevel::Internal,
        "confidential" => ClassificationLevel::Confidential,
        "secret" => ClassificationLevel::Secret,
        _ => ClassificationLevel::Internal,
    };

    let context = ObservabilityContext::new(
        "storage",
        &request.operation,
        classification,
        &request.user_id,
        Uuid::parse_str(&request.session_id).map_err(|e| e.to_string())?,
    );

    let budget = PerformanceBudget::new(2, "storage_operation", false); // 2ms budget

    let result = with_observability!(
        app_state,
        context,
        budget,
        async {
            let state = app_state.read().await;
            
            // MAC enforcement check
            let user_context = state.get_user_context(&request.user_id).await
                .ok_or("User context not found")?;
            let user_label = user_context.to_security_label();
            let data_label = SecurityLabel::new(classification, vec![]);
            
            match request.operation.as_str() {
                "get" => {
                    // Check read access
                    if !state.security_manager.mac_engine.can_read(&user_label, &data_label).await {
                        return Err("Access denied: insufficient clearance for read operation".to_string());
                    }
                    
                    // Perform storage get
                    Ok(serde_json::json!({
                        "key": request.key,
                        "value": "retrieved_value", // Placeholder
                        "access_granted": true
                    }))
                },
                "put" => {
                    // Check write access
                    if !state.security_manager.mac_engine.can_write(&user_label, &data_label).await {
                        return Err("Access denied: insufficient clearance for write operation".to_string());
                    }
                    
                    // Perform storage put
                    Ok(serde_json::json!({
                        "key": request.key,
                        "stored": true,
                        "classification": request.classification
                    }))
                },
                "delete" => {
                    // Check write access (deletion requires write permission)
                    if !state.security_manager.mac_engine.can_write(&user_label, &data_label).await {
                        return Err("Access denied: insufficient clearance for delete operation".to_string());
                    }
                    
                    Ok(serde_json::json!({
                        "key": request.key,
                        "deleted": true
                    }))
                },
                _ => Err(format!("Unknown storage operation: {}", request.operation))
            }
        }
    );

    Ok(result)
}

/// UI action execution (replaces declarative HTML actions)
#[tauri::command]
pub async fn execute_ui_action(
    request: UIAction,
    app_state: State<'_, AppStateType>,
) -> Result<CommandResult<serde_json::Value>, String> {
    let context = ObservabilityContext::new(
        "ui",
        &request.action_type,
        ClassificationLevel::Internal,
        &request.user_id,
        Uuid::parse_str(&request.session_id).map_err(|e| e.to_string())?,
    );

    let budget = PerformanceBudget::new(1, "ui_action", false); // 1ms budget for UI responsiveness

    let result = with_observability!(
        app_state,
        context,
        budget,
        async {
            match request.action_type.as_str() {
                "toggle" => {
                    Ok(serde_json::json!({
                        "action": "toggle",
                        "target": request.target,
                        "new_state": "toggled"
                    }))
                },
                "navigate" => {
                    Ok(serde_json::json!({
                        "action": "navigate",
                        "target": request.target,
                        "navigation_completed": true
                    }))
                },
                "update_view" => {
                    Ok(serde_json::json!({
                        "action": "update_view",
                        "target": request.target,
                        "view_updated": true
                    }))
                },
                _ => Err(format!("Unknown UI action: {}", request.action_type))
            }
        }
    );

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_entity_operation_creation() {
        let operation = EntityOperation {
            entity_type: "user".to_string(),
            entity_id: "user-123".to_string(),
            operation: "update".to_string(),
            data: serde_json::json!({"name": "Test User"}),
            user_id: "admin".to_string(),
            session_id: Uuid::new_v4().to_string(),
        };
        
        assert_eq!(operation.entity_type, "user");
        assert_eq!(operation.operation, "update");
    }
    
    #[test]
    fn test_storage_operation_creation() {
        let operation = StorageOperation {
            operation: "put".to_string(),
            key: "test-key".to_string(),
            value: Some(serde_json::json!({"data": "test"})),
            classification: "confidential".to_string(),
            user_id: "user-123".to_string(),
            session_id: Uuid::new_v4().to_string(),
        };
        
        assert_eq!(operation.operation, "put");
        assert_eq!(operation.classification, "confidential");
    }
}
