// src-tauri/src/observability/mod.rs
// Automatic Observability System - Replaces ForensicRegistry.js, MetricsRegistry.js, ActionDispatcher.js
// Implements the dual execution gateway pattern from the observability implementation plan

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::database::DatabaseManager;
use crate::security::{SecurityLabel, ClassificationLevel};

pub mod forensic_logger;
pub mod metrics_registry;
pub mod action_dispatcher;
pub mod async_orchestrator;
pub mod automatic_instrumentation;

pub use forensic_logger::ForensicLogger;
pub use metrics_registry::MetricsRegistry;
pub use action_dispatcher::ActionDispatcher;
pub use async_orchestrator::AsyncOrchestrator;
pub use automatic_instrumentation::AutomaticInstrumentation;

/// Observability context for operation tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityContext {
    pub operation_id: Uuid,
    pub component: String,        // 'async', 'storage', 'ui', 'network', etc.
    pub operation: String,        // 'run', 'put', 'dispatch', 'fetch', etc.
    pub classification: ClassificationLevel,
    pub performance_state: PerformanceState,
    pub tenant_id: Option<String>,
    pub user_id: String,
    pub timestamp: DateTime<Utc>,
    pub session_id: Uuid,
    pub parent_operation_id: Option<Uuid>,
}

/// Performance state for automatic optimization decisions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PerformanceState {
    Normal,
    HighLoad,
    Degraded,
    Critical,
}

/// Instrumentation decision from policy engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentationDecision {
    pub enabled: bool,
    pub audit_required: bool,
    pub metrics_enabled: bool,
    pub performance_tracking: bool,
    pub full_payload_logging: bool,
    pub overhead_budget_ms: u64,
}

/// Forensic envelope for audit trails (replaces JS ForensicEnvelope)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicEnvelope {
    pub envelope_id: Uuid,
    pub operation_id: Uuid,
    pub event_type: String,
    pub timestamp: DateTime<Utc>,
    pub user_id: String,
    pub session_id: Uuid,
    pub classification: ClassificationLevel,
    pub action: String,
    pub resource: Option<String>,
    pub before_state: Option<serde_json::Value>,
    pub after_state: Option<serde_json::Value>,
    pub metadata: serde_json::Value,
    pub audit_trail_hash: String,
}

/// Metrics data point (replaces JS metrics tracking)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsDataPoint {
    pub metric_id: Uuid,
    pub name: String,
    pub value: f64,
    pub timestamp: DateTime<Utc>,
    pub labels: HashMap<String, String>,
    pub operation_id: Option<Uuid>,
}

/// Operation result with automatic observability
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult<T> {
    pub result: T,
    pub observability_data: ObservabilityData,
}

/// Observability data collected during operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityData {
    pub operation_id: Uuid,
    pub duration_ms: u64,
    pub metrics_recorded: u32,
    pub audit_events: u32,
    pub performance_impact: f64,
    pub cache_hits: u32,
    pub cache_misses: u32,
}

/// Automatic observability trait for instrumented operations
#[async_trait::async_trait]
pub trait AutoObservable {
    type Output;
    type Error;

    /// Execute operation with automatic observability
    async fn execute_with_observability(
        &self,
        context: ObservabilityContext,
        instrumentation: &AutomaticInstrumentation,
    ) -> Result<OperationResult<Self::Output>, Self::Error>;
}

/// Performance budget annotation for critical operations
pub struct PerformanceBudget {
    pub budget_ms: u64,
    pub operation_name: String,
    pub critical: bool,
}

impl PerformanceBudget {
    /// Create a performance budget annotation (replaces JS performance budget comments)
    pub fn new(budget_ms: u64, operation_name: &str, critical: bool) -> Self {
        Self {
            budget_ms,
            operation_name: operation_name.to_string(),
            critical,
        }
    }

    /// Check if operation exceeded budget
    pub fn check_budget(&self, actual_ms: u64) -> BudgetResult {
        if actual_ms <= self.budget_ms {
            BudgetResult::WithinBudget
        } else if self.critical {
            BudgetResult::CriticalExceeded { 
                budget: self.budget_ms, 
                actual: actual_ms 
            }
        } else {
            BudgetResult::Exceeded { 
                budget: self.budget_ms, 
                actual: actual_ms 
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum BudgetResult {
    WithinBudget,
    Exceeded { budget: u64, actual: u64 },
    CriticalExceeded { budget: u64, actual: u64 },
}

impl ObservabilityContext {
    /// Create new observability context for operation tracking
    pub fn new(
        component: &str,
        operation: &str,
        classification: ClassificationLevel,
        user_id: &str,
        session_id: Uuid,
    ) -> Self {
        Self {
            operation_id: Uuid::new_v4(),
            component: component.to_string(),
            operation: operation.to_string(),
            classification,
            performance_state: PerformanceState::Normal,
            tenant_id: None,
            user_id: user_id.to_string(),
            timestamp: Utc::now(),
            session_id,
            parent_operation_id: None,
        }
    }

    /// Create child context for nested operations
    pub fn create_child(&self, component: &str, operation: &str) -> Self {
        Self {
            operation_id: Uuid::new_v4(),
            component: component.to_string(),
            operation: operation.to_string(),
            classification: self.classification.clone(),
            performance_state: self.performance_state.clone(),
            tenant_id: self.tenant_id.clone(),
            user_id: self.user_id.clone(),
            timestamp: Utc::now(),
            session_id: self.session_id,
            parent_operation_id: Some(self.operation_id),
        }
    }

    /// Get cache key for instrumentation decisions
    pub fn cache_key(&self) -> String {
        format!(
            "{}.{}.{:?}.{:?}",
            self.component, self.operation, self.classification, self.performance_state
        )
    }
}

impl ForensicEnvelope {
    /// Create new forensic envelope for audit trail
    pub fn new(
        operation_id: Uuid,
        event_type: &str,
        user_id: &str,
        session_id: Uuid,
        classification: ClassificationLevel,
        action: &str,
    ) -> Self {
        let envelope_id = Uuid::new_v4();
        let timestamp = Utc::now();
        
        // Simple hash for audit trail integrity (in production, use HMAC)
        let audit_trail_hash = format!(
            "{}:{}:{}:{}", 
            envelope_id, timestamp.timestamp(), user_id, action
        );

        Self {
            envelope_id,
            operation_id,
            event_type: event_type.to_string(),
            timestamp,
            user_id: user_id.to_string(),
            session_id,
            classification,
            action: action.to_string(),
            resource: None,
            before_state: None,
            after_state: None,
            metadata: serde_json::Value::Object(serde_json::Map::new()),
            audit_trail_hash,
        }
    }

    /// Add resource information to envelope
    pub fn with_resource(mut self, resource: &str) -> Self {
        self.resource = Some(resource.to_string());
        self
    }

    /// Add state change information
    pub fn with_state_change(
        mut self, 
        before: Option<serde_json::Value>, 
        after: Option<serde_json::Value>
    ) -> Self {
        self.before_state = before;
        self.after_state = after;
        self
    }

    /// Add metadata to envelope
    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = metadata;
        self
    }
}

impl Default for InstrumentationDecision {
    fn default() -> Self {
        Self {
            enabled: true,
            audit_required: false,
            metrics_enabled: true,
            performance_tracking: true,
            full_payload_logging: false,
            overhead_budget_ms: 1, // Default 1ms budget
        }
    }
}

/// Macro for creating performance budget annotations (replaces JS comments)
#[macro_export]
macro_rules! performance_budget {
    ($budget_ms:expr, $operation:expr) => {
        $crate::observability::PerformanceBudget::new($budget_ms, $operation, false)
    };
    ($budget_ms:expr, $operation:expr, critical) => {
        $crate::observability::PerformanceBudget::new($budget_ms, $operation, true)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_observability_context_creation() {
        let context = ObservabilityContext::new(
            "storage",
            "put",
            ClassificationLevel::Confidential,
            "test-user",
            Uuid::new_v4(),
        );

        assert_eq!(context.component, "storage");
        assert_eq!(context.operation, "put");
        assert_eq!(context.classification, ClassificationLevel::Confidential);
        assert_eq!(context.user_id, "test-user");
    }

    #[test]
    fn test_child_context_creation() {
        let parent = ObservabilityContext::new(
            "async",
            "run",
            ClassificationLevel::Secret,
            "test-user",
            Uuid::new_v4(),
        );

        let child = parent.create_child("database", "query");
        
        assert_eq!(child.component, "database");
        assert_eq!(child.operation, "query");
        assert_eq!(child.classification, ClassificationLevel::Secret);
        assert_eq!(child.parent_operation_id, Some(parent.operation_id));
    }

    #[test]
    fn test_performance_budget() {
        let budget = PerformanceBudget::new(10, "test_operation", true);
        
        // Within budget
        let result = budget.check_budget(5);
        matches!(result, BudgetResult::WithinBudget);
        
        // Exceeded budget (critical)
        let result = budget.check_budget(15);
        matches!(result, BudgetResult::CriticalExceeded { .. });
    }

    #[test]
    fn test_forensic_envelope_creation() {
        let envelope = ForensicEnvelope::new(
            Uuid::new_v4(),
            "test.event",
            "test-user",
            Uuid::new_v4(),
            ClassificationLevel::Confidential,
            "test.action",
        );

        assert_eq!(envelope.event_type, "test.event");
        assert_eq!(envelope.user_id, "test-user");
        assert_eq!(envelope.action, "test.action");
        assert!(!envelope.audit_trail_hash.is_empty());
    }

    #[test]
    fn test_performance_budget_macro() {
        let budget = performance_budget!(5, "fast_operation");
        assert_eq!(budget.budget_ms, 5);
        assert_eq!(budget.operation_name, "fast_operation");
        assert!(!budget.critical);

        let critical_budget = performance_budget!(1, "critical_operation", critical);
        assert!(critical_budget.critical);
    }
}
