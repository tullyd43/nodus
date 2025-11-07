// src-tauri/src/observability/instrument.rs
// Zero-overhead instrumentation with static strings and policy-aware execution
// Implements Gemini's pattern with proper lifetime management

use std::future::Future;
use std::time::Instant;
use tracing::info_span;
use crate::policy::policy_snapshot::current_policy;

/// Zero-allocation instrumentation for hot paths
pub async fn instrument<F, Fut, T>(name: &'static str, f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let policy = current_policy();
    
    // Fast path: if observability disabled, skip all instrumentation
    if !policy.obs.enabled || !policy.obs.enabled_for(name) {
        return f().await;
    }
    
    // Create span with minimal allocation
    let span = info_span!("auto", op = name);
    let _guard = span.enter();
    
    let start = Instant::now();
    let result = f().await;
    let duration_ms = start.elapsed().as_millis() as f64;
    
    // Record metrics (static keys to avoid allocation)
    metrics::histogram!("op_duration_ms", duration_ms, "op" => name);
    metrics::counter!("op_total", "op" => name);
    
    result
}

/// Instrumentation with context for security operations
pub async fn instrument_security<F, Fut, T>(
    name: &'static str,
    tenant_id: &str,
    session_id: &str,
    f: F,
) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let policy = current_policy();
    
    if !policy.obs.enabled || !policy.obs.enabled_for(name) {
        return f().await;
    }
    
    // Create span with security context
    let span = if policy.obs.include_tenant_labels {
        info_span!(
            "security",
            op = name,
            tenant_id = tenant_id,
            session_id = session_id
        )
    } else {
        // Avoid high-cardinality labels when disabled
        info_span!("security", op = name)
    };
    
    let _guard = span.enter();
    
    let start = Instant::now();
    let result = f().await;
    let duration_ms = start.elapsed().as_millis() as f64;
    
    // Record metrics with appropriate labels
    if policy.obs.include_tenant_labels {
        metrics::histogram!(
            "security_op_duration_ms", 
            duration_ms,
            "op" => name,
            "tenant_id" => tenant_id
        );
    } else {
        metrics::histogram!(
            "security_op_duration_ms", 
            duration_ms,
            "op" => name
        );
    }
    
    result
}

/// Manual span for fine-grained control
pub struct InstrumentationSpan {
    span: Option<tracing::Span>,
    start_time: Instant,
    operation: &'static str,
    enabled: bool,
}

impl InstrumentationSpan {
    pub fn new(operation: &'static str) -> Self {
        let policy = current_policy();
        let enabled = policy.obs.enabled && policy.obs.enabled_for(operation);
        
        let span = if enabled {
            Some(info_span!("manual", op = operation))
        } else {
            None
        };
        
        Self {
            span,
            start_time: Instant::now(),
            operation,
            enabled,
        }
    }
    
    pub fn record<V: std::fmt::Display>(&self, key: &str, value: V) -> &Self {
        if let Some(ref span) = self.span {
            span.record(key, &tracing::field::display(value));
        }
        self
    }
    
    pub fn enter(&self) -> Option<tracing::span::Entered<'_>> {
        self.span.as_ref().map(|span| span.enter())
    }
    
    pub fn finish(self) {
        if self.enabled {
            let duration_ms = self.start_time.elapsed().as_millis() as f64;
            metrics::histogram!(
                "manual_op_duration_ms",
                duration_ms,
                "op" => self.operation
            );
        }
    }
}

/// Async logger with bounded channels to prevent blocking
pub struct AsyncLogger {
    sender: tokio::sync::mpsc::Sender<AuditEvent>,
}

impl AsyncLogger {
    pub fn new(buffer_size: usize) -> (Self, AsyncLoggerWorker) {
        let (sender, receiver) = tokio::sync::mpsc::channel(buffer_size);
        let worker = AsyncLoggerWorker::new(receiver);
        (Self { sender }, worker)
    }
    
    /// Non-blocking log with drop counting
    pub fn try_log(&self, event: AuditEvent) {
        if let Err(_) = self.sender.try_send(event) {
            metrics::counter!("audit_logs_dropped_total");
            tracing::warn!("Audit log buffer full, dropping entry");
        }
    }
    
    /// Async log (use sparingly to avoid backpressure)
    pub async fn log(&self, event: AuditEvent) -> Result<(), LogError> {
        self.sender.send(event).await
            .map_err(|_| LogError::ChannelClosed)
    }
}

/// Worker that handles async I/O for audit logging
pub struct AsyncLoggerWorker {
    receiver: tokio::sync::mpsc::Receiver<AuditEvent>,
}

impl AsyncLoggerWorker {
    fn new(receiver: tokio::sync::mpsc::Receiver<AuditEvent>) -> Self {
        Self { receiver }
    }
    
    /// Run the worker loop (spawn this in a task)
    pub async fn run(mut self, output_path: &str) -> Result<(), LogError> {
        use tokio::io::AsyncWriteExt;
        
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(output_path)
            .await
            .map_err(|e| LogError::FileError { error: e.to_string() })?;
        
        while let Some(event) = self.receiver.recv().await {
            if let Err(e) = self.write_event(&mut file, &event).await {
                tracing::error!(error = %e, "Failed to write audit event");
                metrics::counter!("audit_write_errors_total");
            }
        }
        
        Ok(())
    }
    
    async fn write_event(
        &self,
        file: &mut tokio::fs::File,
        event: &AuditEvent,
    ) -> Result<(), LogError> {
        use tokio::io::AsyncWriteExt;
        
        let json_line = serde_json::to_vec(event)
            .map_err(|e| LogError::SerializationError { error: e.to_string() })?;
        
        file.write_all(&json_line).await
            .map_err(|e| LogError::FileError { error: e.to_string() })?;
        file.write_all(b"\n").await
            .map_err(|e| LogError::FileError { error: e.to_string() })?;
        
        // Flush periodically (not every write for performance)
        if rand::random::<f32>() < 0.01 { // 1% of writes
            let _ = file.flush().await;
        }
        
        Ok(())
    }
}

/// Audit event structure with static lifetime strings where possible
#[derive(Debug, Clone, serde::Serialize)]
pub struct AuditEvent {
    pub timestamp: i64,
    pub tenant_id: String,
    pub session_id: String,
    pub actor: String,
    pub command: String,
    pub outcome: &'static str, // "success" | "failure" | "unauthorized" | "rate_limited"
    pub error_code: Option<String>,
    pub duration_ms: Option<u64>,
}

impl AuditEvent {
    pub fn new(
        tenant_id: String,
        session_id: String,
        actor: String,
        command: String,
        outcome: &'static str,
    ) -> Self {
        Self {
            timestamp: chrono::Utc::now().timestamp_millis(),
            tenant_id,
            session_id,
            actor,
            command,
            outcome,
            error_code: None,
            duration_ms: None,
        }
    }
    
    pub fn with_error(mut self, error_code: String) -> Self {
        self.error_code = Some(error_code);
        self
    }
    
    pub fn with_duration(mut self, duration_ms: u64) -> Self {
        self.duration_ms = Some(duration_ms);
        self
    }
}

/// Log errors
#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("Log channel closed")]
    ChannelClosed,
    
    #[error("File error: {error}")]
    FileError { error: String },
    
    #[error("Serialization error: {error}")]
    SerializationError { error: String },
}

/// Spawn the audit logger worker
pub fn spawn_audit_worker(buffer_size: usize, output_path: String) -> AsyncLogger {
    let (logger, worker) = AsyncLogger::new(buffer_size);
    
    tokio::spawn(async move {
        if let Err(e) = worker.run(&output_path).await {
            tracing::error!(error = %e, "Audit worker failed");
        }
    });
    
    logger
}

/// Convenience macros for common instrumentation patterns
#[macro_export]
macro_rules! instrument_fn {
    ($name:literal, $fn:expr) => {
        $crate::observability::instrument::instrument($name, $fn)
    };
}

#[macro_export]
macro_rules! instrument_security_fn {
    ($name:literal, $tenant:expr, $session:expr, $fn:expr) => {
        $crate::observability::instrument::instrument_security($name, $tenant, $session, $fn)
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::policy_snapshot::{swap_policy, PolicySnapshot, ObsPolicy};
    
    #[tokio::test]
    async fn test_instrument_disabled() {
        // Set policy to disable observability
        let policy = PolicySnapshot {
            obs: ObsPolicy {
                enabled: false,
                ..Default::default()
            },
            ..Default::default()
        };
        swap_policy(policy);
        
        let mut executed = false;
        let result = instrument("test_op", || async {
            executed = true;
            "result"
        }).await;
        
        assert_eq!(result, "result");
        assert!(executed);
        // No spans should be created (would need integration test to verify)
    }
    
    #[tokio::test]
    async fn test_instrument_enabled() {
        // Set policy to enable observability
        let policy = PolicySnapshot {
            obs: ObsPolicy {
                enabled: true,
                enabled_operations: vec!["test_op".to_string()],
                ..Default::default()
            },
            ..Default::default()
        };
        swap_policy(policy);
        
        let result = instrument("test_op", || async {
            tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
            "result"
        }).await;
        
        assert_eq!(result, "result");
    }
    
    #[test]
    fn test_instrumentation_span() {
        let span = InstrumentationSpan::new("manual_test")
            .record("key", "value");
        
        let _guard = span.enter();
        // Do some work
        span.finish();
    }
    
    #[tokio::test]
    async fn test_async_logger() {
        let temp_dir = tempfile::tempdir().unwrap();
        let log_path = temp_dir.path().join("test_audit.log");
        
        let (logger, worker) = AsyncLogger::new(10);
        
        // Spawn worker
        let worker_handle = tokio::spawn(async move {
            worker.run(log_path.to_str().unwrap()).await
        });
        
        // Send some events
        let event = AuditEvent::new(
            "tenant-123".to_string(),
            "session-456".to_string(),
            "user".to_string(),
            "test_command".to_string(),
            "success",
        );
        
        logger.try_log(event);
        
        // Close logger and wait for worker
        drop(logger);
        let _ = worker_handle.await;
        
        // Verify file was written
        let content = tokio::fs::read_to_string(&log_path).await.unwrap();
        assert!(content.contains("tenant-123"));
        assert!(content.contains("test_command"));
    }
    
    #[test]
    fn test_audit_event_construction() {
        let event = AuditEvent::new(
            "tenant".to_string(),
            "session".to_string(),
            "actor".to_string(),
            "command".to_string(),
            "success",
        )
        .with_error("test_error".to_string())
        .with_duration(100);
        
        assert_eq!(event.outcome, "success");
        assert_eq!(event.error_code, Some("test_error".to_string()));
        assert_eq!(event.duration_ms, Some(100));
    }
}
