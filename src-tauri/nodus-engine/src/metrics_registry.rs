// src-tauri/src/observability/metrics_registry.rs
// Metrics Registry - Automatic Metrics Collection with Sub-1ms Overhead
// Replaces MetricsRegistry.js with high-performance, policy-driven metrics

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use dashmap::DashMap;
use std::sync::atomic::{AtomicU64, AtomicF64, Ordering};

use crate::observability::{ObservabilityContext, MetricsDataPoint};
use crate::security::ClassificationLevel;

/// High-performance metrics registry with automatic collection
/// Designed for <1ms overhead with enterprise-grade features
#[derive(Debug)]
pub struct MetricsRegistry {
    // High-performance concurrent metrics storage
    counters: Arc<DashMap<String, AtomicU64>>,
    gauges: Arc<DashMap<String, AtomicF64>>,
    histograms: Arc<DashMap<String, Histogram>>,
    timers: Arc<DashMap<String, Timer>>,
    
    // Metrics metadata for enterprise features
    metric_metadata: Arc<RwLock<HashMap<String, MetricMetadata>>>,
    
    // Performance optimization
    metric_cache: Arc<DashMap<String, CachedMetric>>,
    
    // Enterprise features
    retention_policy: Arc<RwLock<RetentionPolicy>>,
    export_targets: Arc<RwLock<Vec<ExportTarget>>>,
    
    // Real-time metrics for dashboards
    real_time_buffer: Arc<RwLock<RealTimeBuffer>>,
    
    // Performance tracking
    collection_stats: Arc<RwLock<CollectionStats>>,
}

/// High-performance histogram for latency tracking
#[derive(Debug)]
struct Histogram {
    buckets: Arc<RwLock<Vec<HistogramBucket>>>,
    total_count: AtomicU64,
    total_sum: AtomicF64,
}

/// Histogram bucket for percentile calculations
#[derive(Debug, Clone)]
struct HistogramBucket {
    upper_bound: f64,
    count: AtomicU64,
}

/// High-precision timer for operation tracking
#[derive(Debug)]
struct Timer {
    start_times: Arc<DashMap<Uuid, std::time::Instant>>,
    completed_operations: AtomicU64,
    total_duration_ms: AtomicF64,
    min_duration_ms: AtomicF64,
    max_duration_ms: AtomicF64,
}

/// Cached metric for ultra-fast access
#[derive(Debug, Clone)]
struct CachedMetric {
    value: f64,
    last_updated: DateTime<Utc>,
    access_count: AtomicU64,
}

/// Metadata for enterprise metric management
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MetricMetadata {
    pub name: String,
    pub metric_type: MetricType,
    pub classification: ClassificationLevel,
    pub description: String,
    pub unit: String,
    pub tags: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub last_updated: DateTime<Utc>,
    pub retention_days: u32,
    pub export_enabled: bool,
}

/// Metric types for different data patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetricType {
    Counter,    // Monotonic increasing values
    Gauge,      // Point-in-time values
    Histogram,  // Distribution of values
    Timer,      // Duration measurements
    Summary,    // Quantile measurements
}

/// Retention policy for enterprise compliance
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RetentionPolicy {
    pub default_retention_days: u32,
    pub classification_policies: HashMap<ClassificationLevel, u32>,
    pub automatic_cleanup: bool,
    pub archive_before_deletion: bool,
    pub archive_format: String,
}

/// Export target for enterprise integrations
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExportTarget {
    pub name: String,
    pub target_type: ExportTargetType,
    pub endpoint: String,
    pub format: ExportFormat,
    pub frequency_seconds: u64,
    pub authentication: Option<String>,
    pub filter_criteria: ExportFilter,
}

/// Export target types for different enterprise systems
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportTargetType {
    Prometheus,     // Prometheus metrics scraping
    InfluxDB,       // Time-series database
    ElasticSearch,  // Search and analytics
    Splunk,         // Enterprise logging
    Custom,         // Custom webhook
}

/// Export format for different systems
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    Prometheus,
    JSON,
    CSV,
    XML,
    InfluxLineProtocol,
}

/// Export filter criteria
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExportFilter {
    pub metric_patterns: Vec<String>,
    pub classification_levels: Vec<ClassificationLevel>,
    pub time_range_hours: Option<u32>,
    pub include_metadata: bool,
}

/// Real-time metrics buffer for live dashboards
#[derive(Debug)]
struct RealTimeBuffer {
    recent_metrics: Vec<MetricsDataPoint>,
    buffer_size_limit: usize,
    last_cleanup: DateTime<Utc>,
}

/// Performance statistics for metrics collection
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CollectionStats {
    pub total_metrics_collected: u64,
    pub collection_overhead_ms: f64,
    pub cache_hit_ratio: f64,
    pub export_success_rate: f64,
    pub last_export_time: Option<DateTime<Utc>>,
    pub storage_usage_bytes: u64,
}

/// Real-time metrics snapshot for dashboards
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub timestamp: DateTime<Utc>,
    pub counters: HashMap<String, u64>,
    pub gauges: HashMap<String, f64>,
    pub histograms: HashMap<String, HistogramSnapshot>,
    pub timers: HashMap<String, TimerSnapshot>,
    pub collection_stats: CollectionStats,
}

/// Histogram snapshot for percentile data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistogramSnapshot {
    pub count: u64,
    pub sum: f64,
    pub mean: f64,
    pub p50: f64,
    pub p95: f64,
    pub p99: f64,
    pub buckets: Vec<(f64, u64)>, // (upper_bound, count)
}

/// Timer snapshot for operation performance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerSnapshot {
    pub count: u64,
    pub total_duration_ms: f64,
    pub avg_duration_ms: f64,
    pub min_duration_ms: f64,
    pub max_duration_ms: f64,
}

/// Query criteria for metrics retrieval
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsQuery {
    pub metric_patterns: Vec<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub classification_filter: Option<Vec<ClassificationLevel>>,
    pub aggregation: Option<AggregationType>,
    pub limit: Option<u32>,
}

/// Aggregation types for metrics queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AggregationType {
    Sum,
    Average,
    Min,
    Max,
    Count,
    Rate,
}

impl MetricsRegistry {
    /// Create new high-performance metrics registry
    pub fn new() -> Self {
        Self {
            counters: Arc::new(DashMap::new()),
            gauges: Arc::new(DashMap::new()),
            histograms: Arc::new(DashMap::new()),
            timers: Arc::new(DashMap::new()),
            metric_metadata: Arc::new(RwLock::new(HashMap::new())),
            metric_cache: Arc::new(DashMap::new()),
            retention_policy: Arc::new(RwLock::new(RetentionPolicy::default())),
            export_targets: Arc::new(RwLock::new(Vec::new())),
            real_time_buffer: Arc::new(RwLock::new(RealTimeBuffer::new())),
            collection_stats: Arc::new(RwLock::new(CollectionStats::default())),
        }
    }

    /// Record operation start (called automatically by instrumentation)
    pub async fn record_operation_start(&self, context: &ObservabilityContext) {
        let start_time = std::time::Instant::now();
        
        // Increment operation counter
        let counter_key = format!("{}.{}.count", context.component, context.operation);
        self.increment_counter(&counter_key, 1);
        
        // Start timer for this operation
        let timer_key = format!("{}.{}.duration", context.component, context.operation);
        self.start_timer(&timer_key, context.operation_id).await;
        
        // Record classification metrics (enterprise feature)
        let classification_key = format!("classification.{:?}.operations", context.classification);
        self.increment_counter(&classification_key, 1);
        
        // Update collection stats
        let collection_overhead = start_time.elapsed().as_micros() as f64 / 1000.0;
        self.update_collection_overhead(collection_overhead).await;
    }

    /// Record operation end (called automatically by instrumentation)
    pub async fn record_operation_end(
        &self,
        context: &ObservabilityContext,
        duration: std::time::Duration,
    ) {
        let start_time = std::time::Instant::now();
        
        // Stop timer and record duration
        let timer_key = format!("{}.{}.duration", context.component, context.operation);
        self.stop_timer(&timer_key, context.operation_id, duration).await;
        
        // Record duration in histogram for percentile calculations
        let histogram_key = format!("{}.{}.latency", context.component, context.operation);
        self.record_histogram(&histogram_key, duration.as_millis() as f64).await;
        
        // Update performance state gauge
        let performance_gauge = format!("performance.{:?}", context.performance_state);
        self.set_gauge(&performance_gauge, 1.0);
        
        // Update collection stats
        let collection_overhead = start_time.elapsed().as_micros() as f64 / 1000.0;
        self.update_collection_overhead(collection_overhead).await;
    }

    /// Increment counter with high performance (sub-microsecond)
    pub fn increment_counter(&self, name: &str, value: u64) {
        let counter = self.counters
            .entry(name.to_string())
            .or_insert_with(|| AtomicU64::new(0));
        counter.fetch_add(value, Ordering::Relaxed);
        
        // Update cache for fast access
        let now = Utc::now();
        self.metric_cache.insert(
            name.to_string(),
            CachedMetric {
                value: counter.load(Ordering::Relaxed) as f64,
                last_updated: now,
                access_count: AtomicU64::new(1),
            },
        );
    }

    /// Set gauge value with high performance
    pub fn set_gauge(&self, name: &str, value: f64) {
        let gauge = self.gauges
            .entry(name.to_string())
            .or_insert_with(|| AtomicF64::new(0.0));
        
        // Atomic float operations using bit manipulation
        let bits = value.to_bits();
        gauge.store(f64::from_bits(bits), Ordering::Relaxed);
        
        // Update cache
        self.metric_cache.insert(
            name.to_string(),
            CachedMetric {
                value,
                last_updated: Utc::now(),
                access_count: AtomicU64::new(1),
            },
        );
    }

    /// Record histogram value for distribution tracking
    pub async fn record_histogram(&self, name: &str, value: f64) {
        let histogram = self.histograms
            .entry(name.to_string())
            .or_insert_with(|| Histogram::new());
        
        histogram.record(value).await;
    }

    /// Start timer for operation duration tracking
    pub async fn start_timer(&self, name: &str, operation_id: Uuid) {
        let timer = self.timers
            .entry(name.to_string())
            .or_insert_with(|| Timer::new());
        
        timer.start(operation_id);
    }

    /// Stop timer and record duration
    pub async fn stop_timer(&self, name: &str, operation_id: Uuid, duration: std::time::Duration) {
        if let Some(timer) = self.timers.get(name) {
            timer.stop(operation_id, duration);
        }
    }

    /// Get real-time metrics snapshot for dashboards
    pub async fn get_metrics_snapshot(&self) -> MetricsSnapshot {
        let timestamp = Utc::now();
        
        // Collect counters
        let mut counters = HashMap::new();
        for entry in self.counters.iter() {
            counters.insert(entry.key().clone(), entry.value().load(Ordering::Relaxed));
        }
        
        // Collect gauges
        let mut gauges = HashMap::new();
        for entry in self.gauges.iter() {
            gauges.insert(entry.key().clone(), entry.value().load(Ordering::Relaxed));
        }
        
        // Collect histograms
        let mut histograms = HashMap::new();
        for entry in self.histograms.iter() {
            let snapshot = entry.value().get_snapshot().await;
            histograms.insert(entry.key().clone(), snapshot);
        }
        
        // Collect timers
        let mut timers = HashMap::new();
        for entry in self.timers.iter() {
            let snapshot = entry.value().get_snapshot();
            timers.insert(entry.key().clone(), snapshot);
        }
        
        let collection_stats = self.collection_stats.read().await.clone();
        
        MetricsSnapshot {
            timestamp,
            counters,
            gauges,
            histograms,
            timers,
            collection_stats,
        }
    }

    /// Query metrics with filtering and aggregation
    pub async fn query_metrics(&self, query: MetricsQuery) -> Vec<MetricsDataPoint> {
        let mut results = Vec::new();
        let now = Utc::now();
        
        // Filter metrics by patterns
        for pattern in &query.metric_patterns {
            // Simple pattern matching (in production, use regex)
            for entry in self.counters.iter() {
                if entry.key().contains(pattern) {
                    results.push(MetricsDataPoint {
                        metric_id: Uuid::new_v4(),
                        name: entry.key().clone(),
                        value: entry.value().load(Ordering::Relaxed) as f64,
                        timestamp: now,
                        labels: HashMap::new(),
                        operation_id: None,
                    });
                }
            }
        }
        
        // Apply time filtering
        if let (Some(start), Some(end)) = (query.start_time, query.end_time) {
            results.retain(|point| point.timestamp >= start && point.timestamp <= end);
        }
        
        // Apply limit
        if let Some(limit) = query.limit {
            results.truncate(limit as usize);
        }
        
        results
    }

    /// Export metrics to external systems (enterprise feature)
    pub async fn export_metrics(&self) -> Result<(), MetricsError> {
        let export_targets = self.export_targets.read().await;
        let snapshot = self.get_metrics_snapshot().await;
        
        for target in export_targets.iter() {
            match self.export_to_target(target, &snapshot).await {
                Ok(_) => {
                    tracing::debug!("Successfully exported metrics to {}", target.name);
                },
                Err(e) => {
                    tracing::error!("Failed to export metrics to {}: {}", target.name, e);
                }
            }
        }
        
        // Update export statistics
        let mut stats = self.collection_stats.write().await;
        stats.last_export_time = Some(Utc::now());
        
        Ok(())
    }

    /// Get collection performance statistics
    pub async fn get_collection_stats(&self) -> CollectionStats {
        self.collection_stats.read().await.clone()
    }

    /// Register metric metadata (enterprise feature)
    pub async fn register_metric(
        &self,
        name: &str,
        metric_type: MetricType,
        classification: ClassificationLevel,
        description: &str,
        unit: &str,
        tags: HashMap<String, String>,
    ) {
        let metadata = MetricMetadata {
            name: name.to_string(),
            metric_type,
            classification,
            description: description.to_string(),
            unit: unit.to_string(),
            tags,
            created_at: Utc::now(),
            last_updated: Utc::now(),
            retention_days: 365,  // Default retention
            export_enabled: true,
        };
        
        let mut metadata_map = self.metric_metadata.write().await;
        metadata_map.insert(name.to_string(), metadata);
    }

    /// Update retention policy (enterprise feature)
    pub async fn update_retention_policy(&self, policy: RetentionPolicy) {
        let mut current_policy = self.retention_policy.write().await;
        *current_policy = policy;
    }

    /// Add export target (enterprise feature)
    pub async fn add_export_target(&self, target: ExportTarget) {
        let mut targets = self.export_targets.write().await;
        targets.push(target);
    }

    // Private helper methods

    /// Export metrics to a specific target
    async fn export_to_target(
        &self,
        target: &ExportTarget,
        snapshot: &MetricsSnapshot,
    ) -> Result<(), MetricsError> {
        match target.target_type {
            ExportTargetType::Prometheus => {
                let prometheus_format = self.format_prometheus(snapshot)?;
                self.send_to_endpoint(&target.endpoint, prometheus_format).await
            },
            ExportTargetType::JSON => {
                let json_format = serde_json::to_string(snapshot)
                    .map_err(|e| MetricsError::SerializationError(e.to_string()))?;
                self.send_to_endpoint(&target.endpoint, json_format).await
            },
            _ => Err(MetricsError::UnsupportedTarget(target.target_type.clone())),
        }
    }

    /// Format metrics in Prometheus format
    fn format_prometheus(&self, snapshot: &MetricsSnapshot) -> Result<String, MetricsError> {
        let mut output = String::new();
        
        // Export counters
        for (name, value) in &snapshot.counters {
            output.push_str(&format!("# TYPE {} counter\n", name));
            output.push_str(&format!("{} {}\n", name, value));
        }
        
        // Export gauges
        for (name, value) in &snapshot.gauges {
            output.push_str(&format!("# TYPE {} gauge\n", name));
            output.push_str(&format!("{} {}\n", name, value));
        }
        
        Ok(output)
    }

    /// Send data to external endpoint
    async fn send_to_endpoint(&self, _endpoint: &str, _data: String) -> Result<(), MetricsError> {
        // Placeholder - in production, implement HTTP client
        Ok(())
    }

    /// Update collection overhead statistics
    async fn update_collection_overhead(&self, overhead_ms: f64) {
        let mut stats = self.collection_stats.write().await;
        stats.collection_overhead_ms = (stats.collection_overhead_ms + overhead_ms) / 2.0;
        stats.total_metrics_collected += 1;
    }
}

impl Histogram {
    fn new() -> Self {
        // Default buckets for latency measurements (in milliseconds)
        let bucket_bounds = vec![0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0];
        let buckets = bucket_bounds
            .into_iter()
            .map(|bound| HistogramBucket {
                upper_bound: bound,
                count: AtomicU64::new(0),
            })
            .collect();

        Self {
            buckets: Arc::new(RwLock::new(buckets)),
            total_count: AtomicU64::new(0),
            total_sum: AtomicF64::new(0.0),
        }
    }

    async fn record(&self, value: f64) {
        self.total_count.fetch_add(1, Ordering::Relaxed);
        
        // Atomic float addition using compare-and-swap
        let mut current = self.total_sum.load(Ordering::Relaxed);
        loop {
            let new_value = current + value;
            match self.total_sum.compare_exchange_weak(
                current,
                new_value,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current = x,
            }
        }

        // Update appropriate bucket
        let buckets = self.buckets.read().await;
        for bucket in buckets.iter() {
            if value <= bucket.upper_bound {
                bucket.count.fetch_add(1, Ordering::Relaxed);
                break;
            }
        }
    }

    async fn get_snapshot(&self) -> HistogramSnapshot {
        let buckets = self.buckets.read().await;
        let count = self.total_count.load(Ordering::Relaxed);
        let sum = self.total_sum.load(Ordering::Relaxed);
        
        let mean = if count > 0 { sum / count as f64 } else { 0.0 };
        
        // Calculate percentiles (simplified implementation)
        let p50 = self.calculate_percentile(&buckets, count, 0.5);
        let p95 = self.calculate_percentile(&buckets, count, 0.95);
        let p99 = self.calculate_percentile(&buckets, count, 0.99);
        
        let bucket_data: Vec<(f64, u64)> = buckets
            .iter()
            .map(|b| (b.upper_bound, b.count.load(Ordering::Relaxed)))
            .collect();

        HistogramSnapshot {
            count,
            sum,
            mean,
            p50,
            p95,
            p99,
            buckets: bucket_data,
        }
    }

    fn calculate_percentile(&self, buckets: &[HistogramBucket], total_count: u64, percentile: f64) -> f64 {
        if total_count == 0 {
            return 0.0;
        }

        let target_count = (total_count as f64 * percentile) as u64;
        let mut cumulative_count = 0;
        
        for bucket in buckets {
            cumulative_count += bucket.count.load(Ordering::Relaxed);
            if cumulative_count >= target_count {
                return bucket.upper_bound;
            }
        }
        
        // Return the last bucket's upper bound if not found
        buckets.last().map(|b| b.upper_bound).unwrap_or(0.0)
    }
}

impl Timer {
    fn new() -> Self {
        Self {
            start_times: Arc::new(DashMap::new()),
            completed_operations: AtomicU64::new(0),
            total_duration_ms: AtomicF64::new(0.0),
            min_duration_ms: AtomicF64::new(f64::MAX),
            max_duration_ms: AtomicF64::new(0.0),
        }
    }

    fn start(&self, operation_id: Uuid) {
        self.start_times.insert(operation_id, std::time::Instant::now());
    }

    fn stop(&self, operation_id: Uuid, duration: std::time::Duration) {
        // Remove from start times
        self.start_times.remove(&operation_id);
        
        let duration_ms = duration.as_millis() as f64;
        
        // Update statistics
        self.completed_operations.fetch_add(1, Ordering::Relaxed);
        
        // Update total duration
        let mut current_total = self.total_duration_ms.load(Ordering::Relaxed);
        loop {
            let new_total = current_total + duration_ms;
            match self.total_duration_ms.compare_exchange_weak(
                current_total,
                new_total,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_total = x,
            }
        }
        
        // Update min duration
        let mut current_min = self.min_duration_ms.load(Ordering::Relaxed);
        while duration_ms < current_min {
            match self.min_duration_ms.compare_exchange_weak(
                current_min,
                duration_ms,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_min = x,
            }
        }
        
        // Update max duration
        let mut current_max = self.max_duration_ms.load(Ordering::Relaxed);
        while duration_ms > current_max {
            match self.max_duration_ms.compare_exchange_weak(
                current_max,
                duration_ms,
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(x) => current_max = x,
            }
        }
    }

    fn get_snapshot(&self) -> TimerSnapshot {
        let count = self.completed_operations.load(Ordering::Relaxed);
        let total_duration = self.total_duration_ms.load(Ordering::Relaxed);
        let avg_duration = if count > 0 { total_duration / count as f64 } else { 0.0 };
        
        TimerSnapshot {
            count,
            total_duration_ms: total_duration,
            avg_duration_ms: avg_duration,
            min_duration_ms: self.min_duration_ms.load(Ordering::Relaxed),
            max_duration_ms: self.max_duration_ms.load(Ordering::Relaxed),
        }
    }
}

impl RealTimeBuffer {
    fn new() -> Self {
        Self {
            recent_metrics: Vec::new(),
            buffer_size_limit: 1000,
            last_cleanup: Utc::now(),
        }
    }
}

impl Default for RetentionPolicy {
    fn default() -> Self {
        let mut classification_policies = HashMap::new();
        classification_policies.insert(ClassificationLevel::Unclassified, 30);
        classification_policies.insert(ClassificationLevel::Internal, 90);
        classification_policies.insert(ClassificationLevel::Confidential, 365);
        classification_policies.insert(ClassificationLevel::Secret, 2555); // 7 years
        classification_policies.insert(ClassificationLevel::NatoSecret, 3650); // 10 years

        Self {
            default_retention_days: 365,
            classification_policies,
            automatic_cleanup: true,
            archive_before_deletion: true,
            archive_format: "compressed_json".to_string(),
        }
    }
}

impl Default for CollectionStats {
    fn default() -> Self {
        Self {
            total_metrics_collected: 0,
            collection_overhead_ms: 0.0,
            cache_hit_ratio: 0.0,
            export_success_rate: 100.0,
            last_export_time: None,
            storage_usage_bytes: 0,
        }
    }
}

/// Metrics collection errors
#[derive(Debug, thiserror::Error)]
pub enum MetricsError {
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Unsupported export target: {0:?}")]
    UnsupportedTarget(ExportTargetType),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Configuration error: {0}")]
    ConfigurationError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_counter_operations() {
        let registry = MetricsRegistry::new();
        
        registry.increment_counter("test.counter", 5);
        registry.increment_counter("test.counter", 3);
        
        let counter = registry.counters.get("test.counter").unwrap();
        assert_eq!(counter.load(Ordering::Relaxed), 8);
    }

    #[test]
    fn test_gauge_operations() {
        let registry = MetricsRegistry::new();
        
        registry.set_gauge("test.gauge", 42.5);
        
        let gauge = registry.gauges.get("test.gauge").unwrap();
        assert_eq!(gauge.load(Ordering::Relaxed), 42.5);
    }

    #[tokio::test]
    async fn test_histogram_recording() {
        let histogram = Histogram::new();
        
        histogram.record(1.5).await;
        histogram.record(2.5).await;
        histogram.record(5.0).await;
        
        let snapshot = histogram.get_snapshot().await;
        assert_eq!(snapshot.count, 3);
        assert_eq!(snapshot.sum, 9.0);
        assert_eq!(snapshot.mean, 3.0);
    }

    #[test]
    fn test_timer_operations() {
        let timer = Timer::new();
        let operation_id = Uuid::new_v4();
        
        timer.start(operation_id);
        let duration = std::time::Duration::from_millis(100);
        timer.stop(operation_id, duration);
        
        let snapshot = timer.get_snapshot();
        assert_eq!(snapshot.count, 1);
        assert_eq!(snapshot.total_duration_ms, 100.0);
        assert_eq!(snapshot.avg_duration_ms, 100.0);
    }

    #[tokio::test]
    async fn test_metrics_snapshot() {
        let registry = MetricsRegistry::new();
        
        registry.increment_counter("test.counter", 10);
        registry.set_gauge("test.gauge", 3.14);
        
        let snapshot = registry.get_metrics_snapshot().await;
        assert_eq!(snapshot.counters["test.counter"], 10);
        assert_eq!(snapshot.gauges["test.gauge"], 3.14);
    }
}
