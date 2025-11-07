// src-tauri/src/observability/policy_layer.rs
// Enhanced PolicyLayer with startup logging and proper subscriber ordering
// Implements Gemini's recommendations for production observability

use tracing::{span, Event, Subscriber, Metadata, Level};
use tracing_subscriber::{layer::Context, Layer};
use crate::policy::policy_snapshot::current_policy;

/// Tracing layer that respects policy decisions for zero overhead
pub struct PolicyLayer {
    _phantom: std::marker::PhantomData<()>,
}

impl PolicyLayer {
    pub fn new() -> Self {
        Self {
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<S> Layer<S> for PolicyLayer
where 
    S: Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>,
{
    /// Early filtering - prevents span creation entirely
    fn enabled(&self, metadata: &Metadata<'_>, _ctx: Context<'_, S>) -> bool {
        let policy = current_policy();
        
        // Fast path: if observability disabled globally, reject everything
        if !policy.obs.enabled {
            return false;
        }
        
        // Check operation-specific filtering
        let target = metadata.target();
        if !policy.obs.enabled_for(target) {
            return false;
        }
        
        // Check level filtering based on sampling rate
        match metadata.level() {
            &Level::ERROR | &Level::WARN => true, // Always allow errors and warnings
            &Level::INFO => policy.obs.sampling_rate >= 0.1,
            &Level::DEBUG => policy.obs.sampling_rate >= 0.5,
            &Level::TRACE => policy.obs.sampling_rate >= 0.8,
        }
    }
    
    /// Called when a new span is created
    fn on_new_span(
        &self,
        attrs: &span::Attributes<'_>,
        id: &span::Id,
        ctx: Context<'_, S>,
    ) {
        let policy = current_policy();
        
        // If tenant labels are disabled globally, mark span for stripping
        if !policy.obs.include_tenant_labels {
            if let Some(span) = ctx.span(id) {
                span.extensions_mut().insert(StripTenantLabels);
            }
        }
        
        // Record span creation metric
        if policy.obs.enabled {
            let target = attrs.metadata().target();
            metrics::counter!("spans_created_total", "target" => target);
            
            // Check for span rate limiting
            let current_rate = metrics::gauge!("current_spans_per_second");
            if current_rate > policy.obs.max_spans_per_second as f64 {
                metrics::counter!("spans_rate_limited_total");
                if let Some(span) = ctx.span(id) {
                    span.extensions_mut().insert(RateLimitedSpan);
                }
            }
        }
    }
    
    /// Called when an event is recorded
    fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
        let policy = current_policy();
        
        // Check if we're in a span that should strip tenant info
        if let Some(span_ref) = ctx.lookup_current() {
            if span_ref.extensions().get::<StripTenantLabels>().is_some() {
                // Could modify event fields here to redact sensitive info
                // For now, just let it pass through
            }
            
            // Skip events in rate-limited spans
            if span_ref.extensions().get::<RateLimitedSpan>().is_some() {
                return;
            }
        }
        
        // Record event metric
        if policy.obs.enabled {
            let level = event.metadata().level();
            let target = event.metadata().target();
            metrics::counter!(
                "events_total", 
                "level" => level.as_str(),
                "target" => target
            );
        }
    }
    
    /// Called when a span is entered
    fn on_enter(&self, id: &span::Id, ctx: Context<'_, S>) {
        let policy = current_policy();
        
        if policy.obs.enabled {
            if let Some(span) = ctx.span(id) {
                let metadata = span.metadata();
                metrics::counter!("span_enters_total", "target" => metadata.target());
                
                // Record span enter timestamp for duration calculation
                span.extensions_mut().insert(SpanTiming {
                    entered_at: std::time::Instant::now(),
                });
            }
        }
    }
    
    /// Called when a span is exited
    fn on_exit(&self, id: &span::Id, ctx: Context<'_, S>) {
        let policy = current_policy();
        
        if policy.obs.enabled {
            if let Some(span) = ctx.span(id) {
                let metadata = span.metadata();
                metrics::counter!("span_exits_total", "target" => metadata.target());
                
                // Calculate and record span duration
                if let Some(timing) = span.extensions().get::<SpanTiming>() {
                    let duration_ms = timing.entered_at.elapsed().as_millis() as f64;
                    metrics::histogram!(
                        "span_duration_ms",
                        duration_ms,
                        "target" => metadata.target()
                    );
                }
            }
        }
    }
    
    /// Called when a span is closed
    fn on_close(&self, id: span::Id, ctx: Context<'_, S>) {
        let policy = current_policy();
        
        if policy.obs.enabled {
            if let Some(span) = ctx.span(&id) {
                let metadata = span.metadata();
                metrics::counter!("spans_closed_total", "target" => metadata.target());
            }
        }
    }
}

/// Marker types for span extensions
struct StripTenantLabels;
struct RateLimitedSpan;

#[derive(Debug)]
struct SpanTiming {
    entered_at: std::time::Instant,
}

/// Initialize tracing with PolicyLayer for production
pub fn init_tracing() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
    
    // Environment-based filtering
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,nodus=debug,sqlx=warn,hyper=warn"));
    
    // JSON formatter for structured logs
    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .with_timer(tracing_subscriber::fmt::time::ChronoUtc::rfc_3339());
    
    // Build subscriber with PolicyLayer FIRST (critical for filtering)
    tracing_subscriber::registry()
        .with(env_filter)
        .with(PolicyLayer::new()) // MUST come before fmt layer
        .with(fmt_layer)
        .try_init()?;
    
    // Log startup info with current policy state
    let policy = current_policy();
    tracing::info!(
        observability_enabled = policy.obs.enabled,
        sampling_rate = policy.obs.sampling_rate,
        tenant_labels = policy.obs.include_tenant_labels,
        version = policy.version,
        "PolicyLayer active - tracing initialized"
    );
    
    Ok(())
}

/// Initialize metrics exporter based on features with better error handling
pub fn init_metrics() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    #[cfg(feature = "observability_prometheus")]
    {
        use metrics_exporter_prometheus::PrometheusBuilder;
        use std::time::Duration;
        
        let builder = PrometheusBuilder::new()
            .with_http_listener(([127, 0, 0, 1], 9090))
            .idle_timeout(
                metrics_exporter_prometheus::matching::Matcher::Full(".*".to_string()),
                Some(Duration::from_secs(300))
            );
        
        let handle = builder.install()?;
        
        // Spawn metrics server with proper error handling
        tokio::spawn(async move {
            tracing::info!("Prometheus metrics server starting on :9090");
            
            // The PrometheusBuilder with http_listener handles the server internally
            // We just need to keep the handle alive
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                
                // Periodically check metrics health
                let metric_families = handle.render();
                let metric_count = metric_families.lines().count();
                tracing::debug!(metric_count = metric_count, "Metrics health check");
                
                if metric_count == 0 {
                    tracing::warn!("No metrics being collected");
                }
            }
        });
        
        tracing::info!("Prometheus metrics exporter initialized on :9090");
    }
    
    #[cfg(not(feature = "observability_prometheus"))]
    {
        // Use debugging recorder for development
        let recorder = metrics_util::debugging::DebuggingRecorder::new();
        let handle = recorder.handle();
        metrics::set_boxed_recorder(Box::new(recorder))?;
        
        // Periodically log metrics summary
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(300)); // 5 minutes
            loop {
                interval.tick().await;
                let snapshot = handle.snapshot();
                
                tracing::info!(
                    total_metrics = snapshot.len(),
                    "Metrics summary (debugging recorder)"
                );
                
                // Log top 5 counters for visibility
                let mut counters: Vec<_> = snapshot.into_iter().collect();
                counters.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                
                for (key, value) in counters.iter().take(5) {
                    tracing::debug!(metric = %key, value = %value, "Top metric");
                }
            }
        });
        
        tracing::info!("Debugging metrics recorder initialized");
    }
    
    // Initialize core metrics that we always want to track
    initialize_core_metrics();
    
    Ok(())
}

/// Initialize core metrics that are always tracked
fn initialize_core_metrics() {
    // Application lifecycle metrics
    metrics::counter!("application_starts_total");
    metrics::gauge!("application_uptime_seconds", 0.0);
    metrics::gauge!("system_healthy", 1.0);
    
    // Policy metrics
    metrics::counter!("policy_reloads_total");
    metrics::counter!("policy_reload_failures_total");
    
    // Security metrics
    metrics::counter!("authentication_attempts_total");
    metrics::counter!("authorization_denials_total");
    metrics::counter!("rate_limit_hits_total");
    
    // Performance metrics
    metrics::histogram!("request_duration_ms");
    metrics::counter!("requests_total");
    metrics::gauge!("active_connections", 0.0);
    
    // Log metric initialization
    tracing::info!("Core metrics initialized");
}

/// Spawn background task to update runtime metrics
pub fn spawn_metrics_updater() {
    tokio::spawn(async {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
        let start_time = std::time::Instant::now();
        
        loop {
            interval.tick().await;
            
            // Update uptime
            let uptime_seconds = start_time.elapsed().as_secs() as f64;
            metrics::gauge!("application_uptime_seconds", uptime_seconds);
            
            // Update span rate (spans per second)
            static LAST_SPAN_COUNT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            static LAST_UPDATE: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
            
            // This is a simplified implementation - in practice you'd track actual span creation
            let current_spans = 0; // Would get from actual span counter
            let last_count = LAST_SPAN_COUNT.load(std::sync::atomic::Ordering::Relaxed);
            
            if let Ok(mut last_time) = LAST_UPDATE.lock() {
                if let Some(last) = *last_time {
                    let duration = last.elapsed().as_secs_f64();
                    if duration > 0.0 {
                        let rate = (current_spans - last_count) as f64 / duration;
                        metrics::gauge!("current_spans_per_second", rate);
                    }
                }
                *last_time = Some(std::time::Instant::now());
            }
            
            LAST_SPAN_COUNT.store(current_spans, std::sync::atomic::Ordering::Relaxed);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::policy_snapshot::{swap_policy, PolicySnapshot, ObsPolicy};
    use tracing_subscriber::layer::SubscriberExt;
    
    #[test]
    fn test_policy_layer_filtering() {
        // Set up policy that disables observability
        let policy = PolicySnapshot {
            obs: ObsPolicy {
                enabled: false,
                ..Default::default()
            },
            ..Default::default()
        };
        let _ = swap_policy(policy);
        
        let layer = PolicyLayer::new();
        let metadata = tracing::Metadata::new(
            "test",
            "test_target",
            tracing::Level::INFO,
            None,
            None,
            None,
            tracing::field::FieldSet::new(&[], tracing::callsite::Identifier::new()),
            tracing::metadata::Kind::SPAN,
        );
        
        // Should be disabled when observability is off
        assert!(!layer.enabled(&metadata, tracing_subscriber::layer::Context::none()));
    }
    
    #[test]
    fn test_policy_layer_sampling() {
        // Set up policy with specific sampling rate
        let policy = PolicySnapshot {
            obs: ObsPolicy {
                enabled: true,
                sampling_rate: 0.3, // Only ERROR/WARN should pass
                ..Default::default()
            },
            ..Default::default()
        };
        let _ = swap_policy(policy);
        
        let layer = PolicyLayer::new();
        
        let create_metadata = |level: Level| {
            tracing::Metadata::new(
                "test",
                "test_target", 
                level,
                None,
                None,
                None,
                tracing::field::FieldSet::new(&[], tracing::callsite::Identifier::new()),
                tracing::metadata::Kind::SPAN,
            )
        };
        
        let ctx = tracing_subscriber::layer::Context::none();
        
        // ERROR and WARN should always pass
        assert!(layer.enabled(&create_metadata(Level::ERROR), ctx.clone()));
        assert!(layer.enabled(&create_metadata(Level::WARN), ctx.clone()));
        
        // INFO should be filtered out (sampling_rate < 0.5)
        assert!(!layer.enabled(&create_metadata(Level::INFO), ctx.clone()));
    }
    
    #[tokio::test]
    async fn test_metrics_initialization() {
        // Test that init_metrics doesn't panic
        let result = std::panic::catch_unwind(|| {
            tokio::runtime::Runtime::new().unwrap().block_on(async {
                init_metrics()
            })
        });
        
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_core_metrics_initialization() {
        // This should not panic
        initialize_core_metrics();
        
        // Verify we can record to the metrics
        metrics::counter!("test_counter").increment(1);
        metrics::gauge!("test_gauge", 42.0);
        metrics::histogram!("test_histogram", 100.0);
    }
}
