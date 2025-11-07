// src-tauri/src/observability/automatic_instrumentation.rs
// Automatic Instrumentation System - Implements Policy-Driven Observability
// Replaces manual forensic envelopes with automatic, intelligent observability decisions

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use lru::LruCache;
use std::num::NonZeroUsize;
use uuid::Uuid;

use crate::observability::{ObservabilityContext, InstrumentationDecision, PerformanceState};
use crate::security::{ClassificationLevel, SecurityLabel};
use crate::license::LicenseManager;
use crate::state::AppState;

/// Policy-driven automatic instrumentation engine
/// Implements the "Zero Developer Friction" observability from your implementation plan
#[derive(Debug)]
pub struct AutomaticInstrumentation {
    // Pre-computed instrumentation decisions for sub-0.1ms performance
    decision_cache: Arc<RwLock<LruCache<String, CachedDecision>>>,
    
    // Policy engine for runtime decisions
    policy_engine: PolicyEngine,
    
    // Performance state tracking
    performance_monitor: PerformanceMonitor,
    
    // Enterprise feature gates
    license_manager: Arc<LicenseManager>,
}

/// Cached instrumentation decision with timestamp
#[derive(Debug, Clone)]
struct CachedDecision {
    decision: InstrumentationDecision,
    created_at: chrono::DateTime<chrono::Utc>,
    hit_count: u64,
}

/// Policy engine for instrumentation decisions
#[derive(Debug)]
struct PolicyEngine {
    // Classification-based policies
    classification_policies: HashMap<ClassificationLevel, ClassificationPolicy>,
    
    // Component-specific policies  
    component_policies: HashMap<String, ComponentPolicy>,
    
    // Performance-based policies
    performance_policies: HashMap<PerformanceState, PerformancePolicy>,
    
    // Tenant-specific overrides
    tenant_policies: HashMap<String, TenantPolicy>,
}

/// Classification-based instrumentation policy
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClassificationPolicy {
    pub audit_required: bool,
    pub metrics_enabled: bool,
    pub performance_tracking: bool,
    pub full_payload_logging: bool,
    pub overhead_budget_ms: u64,
    pub cache_ttl_seconds: u64,
}

/// Component-specific instrumentation policy  
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ComponentPolicy {
    pub enabled: bool,
    pub audit_operations: Vec<String>,
    pub metrics_operations: Vec<String>,
    pub performance_critical: bool,
    pub max_overhead_ms: u64,
}

/// Performance-based instrumentation policy
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PerformancePolicy {
    pub reduce_instrumentation: bool,
    pub priority_operations_only: bool,
    pub disable_payload_logging: bool,
    pub emergency_mode: bool,
}

/// Tenant-specific policy overrides
#[derive(Debug, Clone, Serialize, Deserialize)]
struct TenantPolicy {
    pub tenant_id: String,
    pub compliance_level: ComplianceLevel,
    pub custom_audit_requirements: Vec<String>,
    pub performance_requirements: PerformanceRequirements,
}

/// Compliance level for enterprise customers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComplianceLevel {
    Standard,    // Basic audit trails
    SOX,         // Sarbanes-Oxley compliance
    HIPAA,       // Healthcare compliance  
    GDPR,        // Data protection compliance
    Defense,     // Defense-grade audit trails
}

/// Performance requirements for tenant
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PerformanceRequirements {
    pub max_overhead_ms: u64,
    pub max_audit_latency_ms: u64,
    pub high_throughput_mode: bool,
}

/// Performance monitoring for automatic optimization
#[derive(Debug)]
struct PerformanceMonitor {
    current_state: Arc<RwLock<PerformanceState>>,
    operation_timings: Arc<RwLock<HashMap<String, OperationMetrics>>>,
    system_load: Arc<RwLock<SystemLoadMetrics>>,
}

/// Metrics for specific operations
#[derive(Debug, Clone)]
struct OperationMetrics {
    pub avg_duration_ms: f64,
    pub p95_duration_ms: f64,
    pub p99_duration_ms: f64,
    pub total_count: u64,
    pub error_count: u64,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

/// System-wide load metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SystemLoadMetrics {
    pub cpu_usage_percent: f64,
    pub memory_usage_percent: f64,
    pub disk_io_ops_per_sec: f64,
    pub network_ops_per_sec: f64,
    pub concurrent_operations: u64,
}

// Make OperationMetrics serializable as well (used by some instrumentation structs)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OperationMetrics {
    pub avg_duration_ms: f64,
    pub p95_duration_ms: f64,
    pub p99_duration_ms: f64,
    pub total_count: u64,
    pub error_count: u64,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

impl AutomaticInstrumentation {
    /// Create new automatic instrumentation system
    pub fn new(license_manager: Arc<LicenseManager>) -> Self {
        let cache_size = NonZeroUsize::new(2048).unwrap(); // 2K decisions cached
        
        Self {
            decision_cache: Arc::new(RwLock::new(LruCache::new(cache_size))),
            policy_engine: PolicyEngine::new(),
            performance_monitor: PerformanceMonitor::new(),
            license_manager,
        }
    }

    /// Core instrumentation decision engine (replaces manual forensic calls)
    /// This is called by every execution gateway for automatic observability
    pub async fn should_instrument(
        &self,
        context: &ObservabilityContext,
    ) -> InstrumentationDecision {
        let cache_key = context.cache_key();
        
        // FAST PATH: Check cache first (sub-0.1ms performance target)
        {
            let mut cache = self.decision_cache.write().await;
            if let Some(cached) = cache.get_mut(&cache_key) {
                // Update hit count for analytics
                cached.hit_count += 1;
                
                // Check if cache entry is still valid
                let age = chrono::Utc::now() - cached.created_at;
                if age.num_seconds() < 300 { // 5 minute TTL
                    return cached.decision.clone();
                }
                
                // Remove expired entry
                cache.pop(&cache_key);
            }
        }

        // SLOW PATH: Compute new decision (policy engine)
        let decision = self.compute_instrumentation_decision(context).await;
        
        // Cache the decision
        {
            let mut cache = self.decision_cache.write().await;
            cache.put(cache_key, CachedDecision {
                decision: decision.clone(),
                created_at: chrono::Utc::now(),
                hit_count: 1,
            });
        }

        decision
    }

    /// Compute instrumentation decision using policy engine
    async fn compute_instrumentation_decision(
        &self,
        context: &ObservabilityContext,
    ) -> InstrumentationDecision {
        // Get current performance state for optimization decisions
        let performance_state = self.performance_monitor.get_current_state().await;
        
        // Check license tier for feature availability
        let license_tier = self.license_manager.get_tier().await;
        
        // Start with default decision
        let mut decision = InstrumentationDecision::default();
        
        // Apply classification-based policy
        if let Some(class_policy) = self.policy_engine.get_classification_policy(&context.classification) {
            decision.audit_required = class_policy.audit_required;
            decision.metrics_enabled = class_policy.metrics_enabled;
            decision.performance_tracking = class_policy.performance_tracking;
            decision.full_payload_logging = class_policy.full_payload_logging;
            decision.overhead_budget_ms = class_policy.overhead_budget_ms;
        }

        // Apply component-specific policy
        if let Some(comp_policy) = self.policy_engine.get_component_policy(&context.component) {
            decision.enabled = decision.enabled && comp_policy.enabled;
            
            // Check if this specific operation needs audit/metrics
            decision.audit_required = decision.audit_required && 
                comp_policy.audit_operations.contains(&context.operation);
            decision.metrics_enabled = decision.metrics_enabled && 
                comp_policy.metrics_operations.contains(&context.operation);
        }

        // Apply performance-based policy (automatic optimization)
        if let Some(perf_policy) = self.policy_engine.get_performance_policy(&performance_state) {
            if perf_policy.reduce_instrumentation {
                decision.metrics_enabled = false;
                decision.full_payload_logging = false;
                decision.overhead_budget_ms = std::cmp::min(decision.overhead_budget_ms, 1);
            }
            
            if perf_policy.emergency_mode {
                decision.enabled = false; // Disable all instrumentation under extreme load
                return decision;
            }
        }

        // Apply tenant-specific overrides (enterprise feature)
        if let Some(tenant_id) = &context.tenant_id {
            if let Some(tenant_policy) = self.policy_engine.get_tenant_policy(tenant_id) {
                match tenant_policy.compliance_level {
                    ComplianceLevel::SOX | ComplianceLevel::HIPAA | ComplianceLevel::Defense => {
                        decision.audit_required = true; // Force audit for compliance
                        decision.full_payload_logging = true;
                    },
                    ComplianceLevel::GDPR => {
                        decision.audit_required = true;
                        // GDPR: Be careful with payload logging for privacy
                        decision.full_payload_logging = false;
                    },
                    ComplianceLevel::Standard => {
                        // Use default policies
                    }
                }
            }
        }

        // License tier enforcement
        match license_tier {
            crate::license::LicenseTier::Community => {
                // Community: Basic observability only
                decision.full_payload_logging = false;
                decision.overhead_budget_ms = std::cmp::min(decision.overhead_budget_ms, 5);
            },
            crate::license::LicenseTier::Enterprise => {
                // Enterprise: Full observability available
                if !self.license_manager.has_feature("advanced_forensics").await {
                    decision.full_payload_logging = false;
                }
            },
            crate::license::LicenseTier::Pro => {
                // Pro: Intermediate features — keep conservative defaults for now
                decision.full_payload_logging = false;
                decision.overhead_budget_ms = std::cmp::min(decision.overhead_budget_ms, 3);
            },
            crate::license::LicenseTier::Defense => {
                // Defense: Maximum observability with classification handling
                decision.audit_required = true;
                decision.performance_tracking = true;
            }
        }

        decision
    }

    /// Execute automatic instrumentation for an operation
    pub async fn instrument_operation<T, E>(
        &self,
        context: &ObservabilityContext,
        operation: impl std::future::Future<Output = Result<T, E>>,
        app_state: &AppState,
    ) -> Result<T, E> {
        let decision = self.should_instrument(context).await;
        
        if !decision.enabled {
            // No instrumentation - just execute operation
            return operation.await;
        }

        let start_time = std::time::Instant::now();
        
        // Pre-operation instrumentation
        if decision.audit_required {
            if let Err(e) = app_state.forensic_logger.log_operation_start(context).await {
                tracing::warn!("Failed to log operation start: {}", e);
            }
        }
        
        if decision.metrics_enabled {
            app_state.metrics_registry.record_operation_start(context).await;
        }

        // Execute the operation
        let result = operation.await;
        
        let duration = start_time.elapsed();
        
        // Post-operation instrumentation
        if decision.audit_required {
            if let Err(e) = app_state.forensic_logger.log_operation_end(context, &result).await {
                tracing::warn!("Failed to log operation end: {}", e);
            }
        }
        
        if decision.metrics_enabled {
            app_state.metrics_registry.record_operation_end(context, duration).await;
        }

        // Performance budget checking
        if decision.performance_tracking {
            self.check_performance_budget(context, duration, decision.overhead_budget_ms).await;
        }

        // Update performance monitoring for future decisions
        self.performance_monitor.update_operation_metrics(
            &format!("{}.{}", context.component, context.operation),
            duration.as_millis() as f64,
            result.is_ok(),
        ).await;

        result
    }

    /// Check performance budget and trigger alerts if exceeded
    async fn check_performance_budget(
        &self,
        context: &ObservabilityContext,
        actual_duration: std::time::Duration,
        budget_ms: u64,
    ) {
        let actual_ms = actual_duration.as_millis() as u64;
        
        if actual_ms > budget_ms {
            let overage = actual_ms - budget_ms;
            let overage_percent = (overage as f64 / budget_ms as f64) * 100.0;
            
            tracing::warn!(
                "Performance budget exceeded: {}.{} took {}ms (budget: {}ms, overage: {:.1}%)",
                context.component,
                context.operation,
                actual_ms,
                budget_ms,
                overage_percent
            );

            // For critical overages, update performance state
            if overage_percent > 50.0 {
                self.performance_monitor.report_performance_issue(
                    &context.component,
                    overage_percent,
                ).await;
            }
        }
    }

    /// Get instrumentation statistics for observability dashboard
    pub async fn get_instrumentation_stats(&self) -> InstrumentationStats {
        let cache = self.decision_cache.read().await;
        let total_decisions = cache.len();
        let cache_hits: u64 = cache.iter().map(|(_, decision)| decision.hit_count).sum();
        
        InstrumentationStats {
            total_decisions: total_decisions as u64,
            cache_hits,
            cache_hit_ratio: if total_decisions > 0 {
                cache_hits as f64 / total_decisions as f64
            } else {
                0.0
            },
            performance_state: self.performance_monitor.get_current_state().await,
            system_load: self.performance_monitor.get_system_load().await,
        }
    }

    /// Precompute common instrumentation decisions for performance
    pub async fn precompute_common_decisions(&mut self) {
        let common_scenarios = vec![
            // Storage operations
            ("storage", "get", ClassificationLevel::Internal),
            ("storage", "put", ClassificationLevel::Internal),
            ("storage", "delete", ClassificationLevel::Internal),
            
            // UI operations
            ("ui", "render", ClassificationLevel::Internal),
            ("ui", "action", ClassificationLevel::Internal),
            
            // Async operations
            ("async", "run", ClassificationLevel::Internal),
            ("async", "batch", ClassificationLevel::Confidential),
            
            // Network operations  
            ("network", "fetch", ClassificationLevel::Internal),
            ("network", "upload", ClassificationLevel::Confidential),
        ];

        for (component, operation, classification) in common_scenarios {
            let context = ObservabilityContext::new(
                component,
                operation,
                classification,
                "system",
                Uuid::new_v4(),
            );
            
            // This will populate the cache
            self.should_instrument(&context).await;
        }
    }
}

/// Statistics about the instrumentation system
#[derive(Debug, Serialize, Deserialize)]
pub struct InstrumentationStats {
    pub total_decisions: u64,
    pub cache_hits: u64,
    pub cache_hit_ratio: f64,
    pub performance_state: PerformanceState,
    pub system_load: SystemLoadMetrics,
}

impl PolicyEngine {
    /// Create new policy engine with default policies
    fn new() -> Self {
        let mut engine = Self {
            classification_policies: HashMap::new(),
            component_policies: HashMap::new(),
            performance_policies: HashMap::new(),
            tenant_policies: HashMap::new(),
        };
        
        engine.initialize_default_policies();
        engine
    }

    /// Initialize default observability policies
    fn initialize_default_policies(&mut self) {
        // Classification-based policies
        self.classification_policies.insert(
            ClassificationLevel::Unclassified,
            ClassificationPolicy {
                audit_required: false,
                metrics_enabled: true,
                performance_tracking: true,
                full_payload_logging: false,
                overhead_budget_ms: 5,
                cache_ttl_seconds: 300,
            },
        );
        
        self.classification_policies.insert(
            ClassificationLevel::Internal,
            ClassificationPolicy {
                audit_required: true,
                metrics_enabled: true,
                performance_tracking: true,
                full_payload_logging: false,
                overhead_budget_ms: 3,
                cache_ttl_seconds: 300,
            },
        );
        
        self.classification_policies.insert(
            ClassificationLevel::Confidential,
            ClassificationPolicy {
                audit_required: true,
                metrics_enabled: true,
                performance_tracking: true,
                full_payload_logging: true,
                overhead_budget_ms: 2,
                cache_ttl_seconds: 300,
            },
        );
        
        self.classification_policies.insert(
            ClassificationLevel::Secret,
            ClassificationPolicy {
                audit_required: true,
                metrics_enabled: true,
                performance_tracking: true,
                full_payload_logging: true,
                overhead_budget_ms: 1,
                cache_ttl_seconds: 60, // Shorter cache for sensitive data
            },
        );

        // Component-specific policies
        self.component_policies.insert(
            "storage".to_string(),
            ComponentPolicy {
                enabled: true,
                audit_operations: vec!["put".to_string(), "delete".to_string()],
                metrics_operations: vec!["get".to_string(), "put".to_string(), "delete".to_string()],
                performance_critical: true,
                max_overhead_ms: 2,
            },
        );

        self.component_policies.insert(
            "ui".to_string(),
            ComponentPolicy {
                enabled: true,
                audit_operations: vec!["action".to_string()],
                metrics_operations: vec!["render".to_string(), "action".to_string()],
                performance_critical: true,
                max_overhead_ms: 1, // UI must be responsive
            },
        );

        // Performance-based policies
        self.performance_policies.insert(
            PerformanceState::Normal,
            PerformancePolicy {
                reduce_instrumentation: false,
                priority_operations_only: false,
                disable_payload_logging: false,
                emergency_mode: false,
            },
        );
        
        self.performance_policies.insert(
            PerformanceState::HighLoad,
            PerformancePolicy {
                reduce_instrumentation: true,
                priority_operations_only: true,
                disable_payload_logging: true,
                emergency_mode: false,
            },
        );
        
        self.performance_policies.insert(
            PerformanceState::Critical,
            PerformancePolicy {
                reduce_instrumentation: true,
                priority_operations_only: true,
                disable_payload_logging: true,
                emergency_mode: true,
            },
        );
    }

    // Policy accessors
    fn get_classification_policy(&self, classification: &ClassificationLevel) -> Option<&ClassificationPolicy> {
        self.classification_policies.get(classification)
    }

    fn get_component_policy(&self, component: &str) -> Option<&ComponentPolicy> {
        self.component_policies.get(component)
    }

    fn get_performance_policy(&self, state: &PerformanceState) -> Option<&PerformancePolicy> {
        self.performance_policies.get(state)
    }

    fn get_tenant_policy(&self, tenant_id: &str) -> Option<&TenantPolicy> {
        self.tenant_policies.get(tenant_id)
    }
}

impl PerformanceMonitor {
    fn new() -> Self {
        Self {
            current_state: Arc::new(RwLock::new(PerformanceState::Normal)),
            operation_timings: Arc::new(RwLock::new(HashMap::new())),
            system_load: Arc::new(RwLock::new(SystemLoadMetrics {
                cpu_usage_percent: 0.0,
                memory_usage_percent: 0.0,
                disk_io_ops_per_sec: 0.0,
                network_ops_per_sec: 0.0,
                concurrent_operations: 0,
            })),
        }
    }

    async fn get_current_state(&self) -> PerformanceState {
        let state = self.current_state.read().await;
        state.clone()
    }

    async fn get_system_load(&self) -> SystemLoadMetrics {
        let load = self.system_load.read().await;
        load.clone()
    }

    async fn update_operation_metrics(&self, operation: &str, duration_ms: f64, success: bool) {
        let mut timings = self.operation_timings.write().await;
        
        let metrics = timings.entry(operation.to_string()).or_insert(OperationMetrics {
            avg_duration_ms: duration_ms,
            p95_duration_ms: duration_ms,
            p99_duration_ms: duration_ms,
            total_count: 0,
            error_count: 0,
            last_updated: chrono::Utc::now(),
        });

        metrics.total_count += 1;
        if !success {
            metrics.error_count += 1;
        }

        // Simple moving average (in production, use proper percentile calculation)
        metrics.avg_duration_ms = (metrics.avg_duration_ms + duration_ms) / 2.0;
        metrics.last_updated = chrono::Utc::now();
    }

    async fn report_performance_issue(&self, component: &str, overage_percent: f64) {
        // Update performance state based on severity
        let mut state = self.current_state.write().await;
        
        *state = if overage_percent > 200.0 {
            PerformanceState::Critical
        } else if overage_percent > 100.0 {
            PerformanceState::HighLoad
        } else {
            PerformanceState::Degraded
        };

        tracing::warn!(
            "Performance state updated to {:?} due to {} overage: {:.1}%",
            *state,
            component,
            overage_percent
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_instrumentation_decision_caching() {
        let license_manager = Arc::new(LicenseManager::new().await.unwrap());
        let instrumentation = AutomaticInstrumentation::new(license_manager);
        
        let context = ObservabilityContext::new(
            "storage",
            "get",
            ClassificationLevel::Internal,
            "test-user",
            Uuid::new_v4(),
        );

        // First call - should compute decision
        let decision1 = instrumentation.should_instrument(&context).await;
        
        // Second call - should use cache
        let decision2 = instrumentation.should_instrument(&context).await;
        
        // Decisions should be identical (from cache)
        assert_eq!(decision1.enabled, decision2.enabled);
        assert_eq!(decision1.audit_required, decision2.audit_required);
    }

    #[tokio::test]
    async fn test_classification_based_policies() {
        let license_manager = Arc::new(LicenseManager::new().await.unwrap());
        let instrumentation = AutomaticInstrumentation::new(license_manager);
        
        // Unclassified data - minimal instrumentation
        let unclassified_context = ObservabilityContext::new(
            "storage",
            "get",
            ClassificationLevel::Unclassified,
            "test-user",
            Uuid::new_v4(),
        );
        let unclassified_decision = instrumentation.should_instrument(&unclassified_context).await;
        
        // Secret data - full instrumentation
        let secret_context = ObservabilityContext::new(
            "storage",
            "get",
            ClassificationLevel::Secret,
            "test-user",
            Uuid::new_v4(),
        );
        let secret_decision = instrumentation.should_instrument(&secret_context).await;
        
        // Secret should have more instrumentation than unclassified
        assert!(secret_decision.audit_required);
        assert!(secret_decision.full_payload_logging);
        assert!(secret_decision.overhead_budget_ms < unclassified_decision.overhead_budget_ms);
    }
}
