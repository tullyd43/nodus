// src-tauri/src/commands/observability.rs
// Observability Command Handlers - Tauri Commands for Metrics and Audit Access
// Provides secure frontend access to observability data for enterprise dashboards

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::observability::{
    MetricsRegistry, ForensicLogger, AutomaticInstrumentation,
    InstrumentationStats, ForensicStats, AuditSearchCriteria, AuditSearchResults,
    MetricsQuery, MetricsSnapshot, ObservabilityContext,
};
use crate::security::{ClassificationLevel, SecurityContext};
use crate::state::AppState;
use crate::error::AppError;

/// Tauri command for getting real-time metrics snapshot
#[tauri::command]
pub async fn get_metrics_snapshot(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<MetricsSnapshotResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "observability",
        "get_metrics_snapshot",
        ClassificationLevel::Internal,
        &security_context.user_id,
        session_uuid,
    );

    // Get metrics snapshot
    let snapshot = app_state.metrics_registry.get_metrics_snapshot().await;

    Ok(MetricsSnapshotResult {
        timestamp: snapshot.timestamp,
        counters: snapshot.counters,
        gauges: snapshot.gauges,
        histograms: snapshot.histograms.into_iter().map(|(name, histogram)| {
            (name, HistogramResult {
                count: histogram.count,
                sum: histogram.sum,
                mean: histogram.mean,
                p50: histogram.p50,
                p95: histogram.p95,
                p99: histogram.p99,
                buckets: histogram.buckets,
            })
        }).collect(),
        timers: snapshot.timers.into_iter().map(|(name, timer)| {
            (name, TimerResult {
                count: timer.count,
                total_duration_ms: timer.total_duration_ms,
                avg_duration_ms: timer.avg_duration_ms,
                min_duration_ms: timer.min_duration_ms,
                max_duration_ms: timer.max_duration_ms,
            })
        }).collect(),
        collection_stats: CollectionStatsResult {
            total_decisions: snapshot.collection_stats.total_metrics_collected,
            cache_hits: snapshot.collection_stats.collection_overhead_ms as u64,
            cache_hit_ratio: snapshot.collection_stats.cache_hit_ratio,
            export_success_rate: snapshot.collection_stats.export_success_rate,
        },
    })
}

/// Tauri command for querying metrics with filters
#[tauri::command]
pub async fn query_metrics(
    session_id: String,
    query: MetricsQueryRequest,
    app_state: tauri::State<'_, AppState>,
) -> Result<MetricsQueryResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Parse classification filters
    let classification_filter = if let Some(classifications) = query.classification_filter {
        Some(classifications.into_iter()
            .map(|c| parse_classification(&c))
            .collect::<Result<Vec<_>, _>>()?)
    } else {
        None
    };

    // Build metrics query
    let metrics_query = MetricsQuery {
        metric_patterns: query.metric_patterns,
        start_time: query.start_time,
        end_time: query.end_time,
        classification_filter,
        aggregation: query.aggregation.map(|a| parse_aggregation_type(&a)).transpose()?,
        limit: query.limit,
    };

    // Execute query
    let metrics_data = app_state.metrics_registry.query_metrics(metrics_query).await;

    Ok(MetricsQueryResult {
        metrics: metrics_data.into_iter().map(|metric| MetricDataPoint {
            name: metric.name,
            value: metric.value,
            timestamp: metric.timestamp,
            labels: metric.labels,
            operation_id: metric.operation_id.map(|id| id.to_string()),
        }).collect(),
        total_count: metrics_data.len() as u64,
        query_time_ms: 0, // TODO: Implement query timing
    })
}

/// Tauri command for getting instrumentation statistics
#[tauri::command]
pub async fn get_instrumentation_stats(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<InstrumentationStatsResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get instrumentation statistics
    let stats = app_state.automatic_instrumentation.get_instrumentation_stats().await;

    Ok(InstrumentationStatsResult {
        total_decisions: stats.total_decisions,
        cache_hits: stats.cache_hits,
        cache_hit_ratio: stats.cache_hit_ratio,
        performance_state: format!("{:?}", stats.performance_state),
        system_load: SystemLoadResult {
            cpu_usage_percent: stats.system_load.cpu_usage_percent,
            memory_usage_percent: stats.system_load.memory_usage_percent,
            disk_io_ops_per_sec: stats.system_load.disk_io_ops_per_sec,
            network_ops_per_sec: stats.system_load.network_ops_per_sec,
            concurrent_operations: stats.system_load.concurrent_operations,
        },
    })
}

/// Tauri command for searching audit trail
#[tauri::command]
pub async fn search_audit_trail(
    session_id: String,
    search_criteria: AuditSearchRequest,
    app_state: tauri::State<'_, AppState>,
) -> Result<AuditSearchResponse, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check if user has audit access permissions
    if !security_context.permissions.contains(&"audit_access".to_string()) {
        return Err("Insufficient permissions for audit trail access".to_string());
    }

    // Parse classification levels
    let classification_levels = if let Some(classifications) = search_criteria.classification_levels {
        classifications.into_iter()
            .map(|c| parse_classification(&c))
            .collect::<Result<Vec<_>, _>>()?
    } else {
        vec![]
    };

    // Parse event types
    let event_types = search_criteria.event_types.unwrap_or_default();

    // Build audit search criteria
    let criteria = AuditSearchCriteria {
        start_time: search_criteria.start_time,
        end_time: search_criteria.end_time,
        user_id: search_criteria.user_id,
        event_types: event_types.into_iter()
            .map(|et| parse_forensic_event_type(&et))
            .collect::<Result<Vec<_>, _>>()?,
        classification_levels,
        components: search_criteria.components.unwrap_or_default(),
        limit: search_criteria.limit,
        offset: search_criteria.offset,
    };

    // Execute audit search
    let search_results = app_state.forensic_logger.search_audit_trail(criteria).await
        .map_err(|e| e.to_string())?;

    Ok(AuditSearchResponse {
        envelopes: search_results.envelopes.into_iter().map(|envelope| AuditEnvelopeResult {
            operation_id: envelope.operation_id.to_string(),
            event_type: envelope.event_type,
            user_id: envelope.user_id,
            session_id: envelope.session_id.to_string(),
            timestamp: envelope.timestamp,
            classification: envelope.classification.to_string(),
            action: envelope.action,
            resource: envelope.resource,
            before_state: envelope.before_state,
            after_state: envelope.after_state,
            metadata: envelope.metadata,
            audit_trail_hash: envelope.audit_trail_hash,
        }).collect(),
        total_count: search_results.total_count,
        search_time_ms: search_results.search_time_ms,
        integrity_verified: search_results.integrity_verified,
    })
}

/// Tauri command for exporting audit trail
#[tauri::command]
pub async fn export_audit_trail(
    session_id: String,
    export_request: AuditExportRequest,
    app_state: tauri::State<'_, AppState>,
) -> Result<AuditExportResponse, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check if user has audit export permissions
    if !security_context.permissions.contains(&"audit_export".to_string()) {
        return Err("Insufficient permissions for audit trail export".to_string());
    }

    // Parse classification levels
    let classification_levels = if let Some(classifications) = export_request.classification_levels {
        classifications.into_iter()
            .map(|c| parse_classification(&c))
            .collect::<Result<Vec<_>, _>>()?
    } else {
        vec![]
    };

    // Build audit search criteria
    let criteria = AuditSearchCriteria {
        start_time: export_request.start_time,
        end_time: export_request.end_time,
        user_id: export_request.user_id,
        event_types: vec![], // Export all event types
        classification_levels,
        components: export_request.components.unwrap_or_default(),
        limit: None, // No limit for exports
        offset: None,
    };

    // Export audit trail
    let export_data = app_state.forensic_logger.export_audit_trail(
        criteria,
        &export_request.format,
    ).await.map_err(|e| e.to_string())?;

    Ok(AuditExportResponse {
        export_id: Uuid::new_v4().to_string(),
        format: export_request.format,
        data_size_bytes: export_data.len(),
        export_data: base64::encode(&export_data),
        generated_at: chrono::Utc::now(),
        expires_at: chrono::Utc::now() + chrono::Duration::hours(24),
    })
}

/// Tauri command for getting forensic logging statistics
#[tauri::command]
pub async fn get_forensic_stats(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<ForensicStatsResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get forensic logging statistics
    let stats = app_state.forensic_logger.get_logging_stats().await;

    Ok(ForensicStatsResult {
        total_events_logged: stats.total_events_logged,
        pending_events: stats.pending_events,
        buffer_size_bytes: stats.buffer_size_bytes,
        last_flush_time: stats.last_flush_time,
        avg_envelope_size_bytes: stats.avg_envelope_size_bytes,
        integrity_verifications: stats.integrity_verifications,
        failed_verifications: stats.failed_verifications,
    })
}

/// Tauri command for getting operation performance metrics
#[tauri::command]
pub async fn get_operation_metrics(
    session_id: String,
    time_range_hours: Option<u32>,
    app_state: tauri::State<'_, AppState>,
) -> Result<OperationMetricsResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get operation metrics from async orchestrator
    let operation_metrics = app_state.async_orchestrator.get_operation_metrics().await;

    // Get action metrics from action dispatcher
    let action_metrics = app_state.action_dispatcher.get_action_stats().await;

    // Convert to result format
    let mut operations = Vec::new();

    // Add async operation metrics
    for (name, metrics) in operation_metrics {
        operations.push(OperationMetricData {
            operation_name: name,
            operation_type: "async".to_string(),
            total_executions: metrics.total_executions,
            successful_executions: metrics.successful_executions,
            failed_executions: metrics.failed_executions,
            avg_duration_ms: metrics.avg_duration_ms,
            p95_duration_ms: metrics.p95_duration_ms,
            p99_duration_ms: metrics.p99_duration_ms,
            last_execution: metrics.last_execution,
            circuit_breaker_trips: metrics.circuit_breaker_trips,
            retry_attempts: metrics.retry_attempts,
        });
    }

    // Add action metrics
    for (name, metrics) in action_metrics {
        operations.push(OperationMetricData {
            operation_name: name,
            operation_type: "action".to_string(),
            total_executions: metrics.total_executions,
            successful_executions: (metrics.total_executions as f64 * metrics.success_rate / 100.0) as u64,
            failed_executions: metrics.total_executions - (metrics.total_executions as f64 * metrics.success_rate / 100.0) as u64,
            avg_duration_ms: metrics.avg_duration_ms,
            p95_duration_ms: metrics.slowest_execution_ms as f64, // Simplified
            p99_duration_ms: metrics.slowest_execution_ms as f64,
            last_execution: metrics.last_execution,
            circuit_breaker_trips: 0, // Actions don't have circuit breakers
            retry_attempts: 0, // Actions don't have retries
        });
    }

    Ok(OperationMetricsResult {
        operations,
        time_range_hours: time_range_hours.unwrap_or(24),
        total_operations: operations.len() as u32,
    })
}

/// Tauri command for getting system health status
#[tauri::command]
pub async fn get_system_health(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<SystemHealthResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get various health metrics
    let security_metrics = app_state.security_manager.get_security_metrics().await;
    let instrumentation_stats = app_state.automatic_instrumentation.get_instrumentation_stats().await;
    let forensic_stats = app_state.forensic_logger.get_logging_stats().await;
    let state_info = app_state.hybrid_state_manager.get_state_info().await;

    // Calculate overall health score
    let mut health_score = 100.0;
    let mut health_issues = Vec::new();

    // Check various health indicators
    if security_metrics.avg_risk_score > 70.0 {
        health_score -= 20.0;
        health_issues.push("High average risk score detected".to_string());
    }

    if instrumentation_stats.cache_hit_ratio < 0.8 {
        health_score -= 10.0;
        health_issues.push("Low observability cache hit ratio".to_string());
    }

    if forensic_stats.failed_verifications > 0 {
        health_score -= 30.0;
        health_issues.push("Audit trail integrity failures detected".to_string());
    }

    if state_info.error_rate > 0.05 {
        health_score -= 15.0;
        health_issues.push("Elevated error rate detected".to_string());
    }

    let health_status = if health_score >= 90.0 {
        "healthy"
    } else if health_score >= 70.0 {
        "warning"
    } else if health_score >= 50.0 {
        "degraded"
    } else {
        "critical"
    };

    Ok(SystemHealthResult {
        overall_health_score: health_score,
        health_status: health_status.to_string(),
        health_issues,
        component_health: ComponentHealthResult {
            security: ComponentHealth {
                status: if security_metrics.avg_risk_score < 50.0 { "healthy" } else { "warning" }.to_string(),
                score: 100.0 - security_metrics.avg_risk_score,
                last_check: chrono::Utc::now(),
            },
            observability: ComponentHealth {
                status: if instrumentation_stats.cache_hit_ratio > 0.8 { "healthy" } else { "warning" }.to_string(),
                score: instrumentation_stats.cache_hit_ratio * 100.0,
                last_check: chrono::Utc::now(),
            },
            database: ComponentHealth {
                status: if state_info.error_rate < 0.01 { "healthy" } else { "warning" }.to_string(),
                score: (1.0 - state_info.error_rate) * 100.0,
                last_check: chrono::Utc::now(),
            },
            networking: ComponentHealth {
                status: "healthy".to_string(), // TODO: Implement network health checks
                score: 100.0,
                last_check: chrono::Utc::now(),
            },
        },
        system_metrics: SystemMetricsResult {
            cpu_usage_percent: instrumentation_stats.system_load.cpu_usage_percent,
            memory_usage_percent: instrumentation_stats.system_load.memory_usage_percent,
            active_operations: instrumentation_stats.system_load.concurrent_operations,
            active_sessions: security_metrics.active_sessions,
            operations_per_second: state_info.operations_per_second,
            error_rate: state_info.error_rate,
        },
        last_updated: chrono::Utc::now(),
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

fn parse_aggregation_type(aggregation: &str) -> Result<crate::observability::AggregationType, String> {
    use crate::observability::AggregationType;
    
    match aggregation.to_lowercase().as_str() {
        "sum" => Ok(AggregationType::Sum),
        "average" | "avg" => Ok(AggregationType::Average),
        "min" => Ok(AggregationType::Min),
        "max" => Ok(AggregationType::Max),
        "count" => Ok(AggregationType::Count),
        "rate" => Ok(AggregationType::Rate),
        _ => Err(format!("Invalid aggregation type: {}", aggregation)),
    }
}

fn parse_forensic_event_type(event_type: &str) -> Result<crate::observability::ForensicEventType, String> {
    use crate::observability::ForensicEventType;
    
    match event_type.to_lowercase().as_str() {
        "authentication" => Ok(ForensicEventType::Authentication),
        "authorization" => Ok(ForensicEventType::Authorization),
        "access_denied" => Ok(ForensicEventType::AccessDenied),
        "security_violation" => Ok(ForensicEventType::SecurityViolation),
        "data_access" => Ok(ForensicEventType::DataAccess),
        "data_modification" => Ok(ForensicEventType::DataModification),
        "data_deletion" => Ok(ForensicEventType::DataDeletion),
        "data_export" => Ok(ForensicEventType::DataExport),
        "system_start" => Ok(ForensicEventType::SystemStart),
        "system_stop" => Ok(ForensicEventType::SystemStop),
        "configuration_change" => Ok(ForensicEventType::ConfigurationChange),
        "performance_alert" => Ok(ForensicEventType::PerformanceAlert),
        "user_login" => Ok(ForensicEventType::UserLogin),
        "user_logout" => Ok(ForensicEventType::UserLogout),
        "user_action" => Ok(ForensicEventType::UserAction),
        "policy_violation" => Ok(ForensicEventType::PolicyViolation),
        "compliance_check" => Ok(ForensicEventType::ComplianceCheck),
        "audit_export" => Ok(ForensicEventType::AuditExport),
        _ => Err(format!("Invalid forensic event type: {}", event_type)),
    }
}

// Request/Response types for Tauri commands

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsSnapshotResult {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub counters: HashMap<String, u64>,
    pub gauges: HashMap<String, f64>,
    pub histograms: HashMap<String, HistogramResult>,
    pub timers: HashMap<String, TimerResult>,
    pub collection_stats: CollectionStatsResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HistogramResult {
    pub count: u64,
    pub sum: f64,
    pub mean: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub buckets: Vec<(f64, u64)>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimerResult {
    pub count: u64,
    pub total_duration_ms: f64,
    pub avg_duration_ms: f64,
    pub min_duration_ms: f64,
    pub max_duration_ms: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionStatsResult {
    pub total_decisions: u64,
    pub cache_hits: u64,
    pub cache_hit_ratio: f64,
    pub export_success_rate: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsQueryRequest {
    pub metric_patterns: Vec<String>,
    pub start_time: Option<chrono::DateTime<chrono::Utc>>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub classification_filter: Option<Vec<String>>,
    pub aggregation: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsQueryResult {
    pub metrics: Vec<MetricDataPoint>,
    pub total_count: u64,
    pub query_time_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricDataPoint {
    pub name: String,
    pub value: f64,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub labels: HashMap<String, String>,
    pub operation_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstrumentationStatsResult {
    pub total_decisions: u64,
    pub cache_hits: u64,
    pub cache_hit_ratio: f64,
    pub performance_state: String,
    pub system_load: SystemLoadResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemLoadResult {
    pub cpu_usage_percent: f64,
    pub memory_usage_percent: f64,
    pub disk_io_ops_per_sec: f64,
    pub network_ops_per_sec: f64,
    pub concurrent_operations: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditSearchRequest {
    pub start_time: Option<chrono::DateTime<chrono::Utc>>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub user_id: Option<String>,
    pub event_types: Option<Vec<String>>,
    pub classification_levels: Option<Vec<String>>,
    pub components: Option<Vec<String>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditSearchResponse {
    pub envelopes: Vec<AuditEnvelopeResult>,
    pub total_count: u64,
    pub search_time_ms: u64,
    pub integrity_verified: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditEnvelopeResult {
    pub operation_id: String,
    pub event_type: String,
    pub user_id: String,
    pub session_id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub classification: String,
    pub action: String,
    pub resource: Option<String>,
    pub before_state: Option<serde_json::Value>,
    pub after_state: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub audit_trail_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditExportRequest {
    pub start_time: Option<chrono::DateTime<chrono::Utc>>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub user_id: Option<String>,
    pub classification_levels: Option<Vec<String>>,
    pub components: Option<Vec<String>>,
    pub format: String, // "json", "csv", "xml"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditExportResponse {
    pub export_id: String,
    pub format: String,
    pub data_size_bytes: usize,
    pub export_data: String, // Base64 encoded
    pub generated_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ForensicStatsResult {
    pub total_events_logged: u64,
    pub pending_events: u64,
    pub buffer_size_bytes: usize,
    pub last_flush_time: chrono::DateTime<chrono::Utc>,
    pub avg_envelope_size_bytes: f64,
    pub integrity_verifications: u64,
    pub failed_verifications: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OperationMetricsResult {
    pub operations: Vec<OperationMetricData>,
    pub time_range_hours: u32,
    pub total_operations: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OperationMetricData {
    pub operation_name: String,
    pub operation_type: String, // "action" or "async"
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub avg_duration_ms: f64,
    pub p95_duration_ms: f64,
    pub p99_duration_ms: f64,
    pub last_execution: chrono::DateTime<chrono::Utc>,
    pub circuit_breaker_trips: u32,
    pub retry_attempts: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemHealthResult {
    pub overall_health_score: f64,
    pub health_status: String, // "healthy", "warning", "degraded", "critical"
    pub health_issues: Vec<String>,
    pub component_health: ComponentHealthResult,
    pub system_metrics: SystemMetricsResult,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ComponentHealthResult {
    pub security: ComponentHealth,
    pub observability: ComponentHealth,
    pub database: ComponentHealth,
    pub networking: ComponentHealth,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub status: String,
    pub score: f64,
    pub last_check: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemMetricsResult {
    pub cpu_usage_percent: f64,
    pub memory_usage_percent: f64,
    pub active_operations: u64,
    pub active_sessions: u32,
    pub operations_per_second: f64,
    pub error_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_aggregation_type() {
        assert!(matches!(
            parse_aggregation_type("sum"),
            Ok(crate::observability::AggregationType::Sum)
        ));
        
        assert!(matches!(
            parse_aggregation_type("avg"),
            Ok(crate::observability::AggregationType::Average)
        ));
        
        assert!(parse_aggregation_type("invalid").is_err());
    }

    #[test]
    fn test_parse_forensic_event_type() {
        assert!(matches!(
            parse_forensic_event_type("authentication"),
            Ok(crate::observability::ForensicEventType::Authentication)
        ));
        
        assert!(parse_forensic_event_type("invalid").is_err());
    }

    #[test]
    fn test_metrics_query_request_serialization() {
        let request = MetricsQueryRequest {
            metric_patterns: vec!["cpu.*".to_string(), "memory.*".to_string()],
            start_time: Some(chrono::Utc::now() - chrono::Duration::hours(1)),
            end_time: Some(chrono::Utc::now()),
            classification_filter: Some(vec!["INTERNAL".to_string()]),
            aggregation: Some("avg".to_string()),
            limit: Some(100),
        };
        
        let serialized = serde_json::to_string(&request).unwrap();
        let deserialized: MetricsQueryRequest = serde_json::from_str(&serialized).unwrap();
        
        assert_eq!(request.metric_patterns, deserialized.metric_patterns);
        assert_eq!(request.limit, deserialized.limit);
    }
}
