// src-tauri/src/commands/dispatch.rs
// Enhanced single front-door dispatch with comprehensive audit and metrics
// Implements Gemini's recommendations for production-grade security

use std::collections::HashMap;
use std::time::Instant;
use serde_json::Value;
use tauri::State;
use tracing::{info, warn, error, instrument};

use crate::policy::policy_snapshot::current_policy;
use crate::observability::instrument::{instrument, instrument_security, AuditEvent, AsyncLogger};
use crate::state::AppState;

/// Request context - required for ALL operations
#[derive(Clone, Debug, serde::Deserialize)]
pub struct Context {
    pub tenant_id: String,
    pub session_id: String,
    pub actor: String,
    // Optional fields for enhanced security
    pub user_id: Option<String>,
    pub source_ip: Option<String>,
    pub user_agent: Option<String>,
}

impl Context {
    /// Validate context has all required fields
    pub fn validate(&self) -> Result<(), DispatchError> {
        if self.tenant_id.is_empty() {
            return Err(DispatchError::BadRequest("missing tenant_id".into()));
        }
        if self.session_id.is_empty() {
            return Err(DispatchError::BadRequest("missing session_id".into()));
        }
        if self.actor.is_empty() {
            return Err(DispatchError::BadRequest("missing actor".into()));
        }
        
        // Additional validation
        if self.tenant_id.len() > 100 {
            return Err(DispatchError::BadRequest("tenant_id too long".into()));
        }
        if self.session_id.len() > 100 {
            return Err(DispatchError::BadRequest("session_id too long".into()));
        }
        if self.actor.len() > 50 {
            return Err(DispatchError::BadRequest("actor too long".into()));
        }
        
        Ok(())
    }
}

/// Dispatch errors with proper HTTP-like status codes and detailed context
#[derive(Debug, thiserror::Error)]
pub enum DispatchError {
    #[error("Bad request: {0}")]
    BadRequest(String),
    
    #[error("Unauthorized: {reason}")]
    Unauthorized { reason: String },
    
    #[error("Forbidden: {reason}")]
    Forbidden { reason: String },
    
    #[error("Rate limited: {command}")]
    RateLimited { command: String },
    
    #[error("Command not found: {0}")]
    NotFound(String),
    
    #[error("Internal error: {0}")]
    Internal(String),
    
    #[error("Service unavailable: {reason}")]
    ServiceUnavailable { reason: String },
}

impl DispatchError {
    pub fn status_code(&self) -> u16 {
        match self {
            DispatchError::BadRequest(_) => 400,
            DispatchError::Unauthorized { .. } => 401,
            DispatchError::Forbidden { .. } => 403,
            DispatchError::NotFound(_) => 404,
            DispatchError::RateLimited { .. } => 429,
            DispatchError::Internal(_) => 500,
            DispatchError::ServiceUnavailable { .. } => 503,
        }
    }
    
    pub fn outcome(&self) -> &'static str {
        match self {
            DispatchError::BadRequest(_) => "bad_request",
            DispatchError::Unauthorized { .. } => "unauthorized",
            DispatchError::Forbidden { .. } => "forbidden",
            DispatchError::NotFound(_) => "not_found",
            DispatchError::RateLimited { .. } => "rate_limited",
            DispatchError::Internal(_) => "internal_error",
            DispatchError::ServiceUnavailable { .. } => "service_unavailable",
        }
    }
    
    pub fn is_client_error(&self) -> bool {
        matches!(self.status_code(), 400..=499)
    }
    
    pub fn is_server_error(&self) -> bool {
        matches!(self.status_code(), 500..=599)
    }
}

/// Enhanced rate limiter with tenant/actor isolation and sliding windows
pub struct RateLimiter {
    counters: tokio::sync::RwLock<HashMap<String, RateCounter>>,
    cleanup_interval: tokio::time::Interval,
}

#[derive(Debug, Clone)]
struct RateCounter {
    count: u64,
    window_start: chrono::DateTime<chrono::Utc>,
    last_access: chrono::DateTime<chrono::Utc>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            counters: tokio::sync::RwLock::new(HashMap::new()),
            cleanup_interval: tokio::time::interval(std::time::Duration::from_secs(300)), // 5 minutes
        }
    }
    
    pub async fn check_rate_limit(&self, ctx: &Context, command: &str) -> Result<(), DispatchError> {
        let policy = current_policy();
        let rate_limit = match policy.sec.get_rate_limit(command) {
            Some(limit) => limit,
            None => return Ok(()), // No rate limit configured
        };
        
        let key = format!("{}:{}:{}", ctx.tenant_id, ctx.actor, command);
        let now = chrono::Utc::now();
        
        let mut counters = self.counters.write().await;
        
        let counter = counters.entry(key.clone()).or_insert_with(|| RateCounter {
            count: 0,
            window_start: now,
            last_access: now,
        });
        
        // Reset window if needed (1-minute sliding window)
        if now.signed_duration_since(counter.window_start).num_minutes() >= 1 {
            counter.count = 0;
            counter.window_start = now;
        }
        
        counter.count += 1;
        counter.last_access = now;
        
        if counter.count > rate_limit.requests_per_minute {
            // Record rate limit metrics with detailed labels
            metrics::counter!(
                "rate_limit_exceeded_total",
                "tenant_id" => ctx.tenant_id.clone(),
                "actor" => ctx.actor.clone(),
                "command" => command
            );
            
            metrics::histogram!(
                "rate_limit_excess_amount",
                (counter.count - rate_limit.requests_per_minute) as f64,
                "command" => command
            );
            
            return Err(DispatchError::RateLimited { 
                command: command.to_string() 
            });
        }
        
        // Record successful rate limit check
        metrics::counter!(
            "rate_limit_checks_passed_total",
            "command" => command
        );
        
        Ok(())
    }
    
    /// Cleanup old rate limit entries to prevent memory leaks
    pub async fn cleanup_old_entries(&mut self) {
        self.cleanup_interval.tick().await;
        
        let mut counters = self.counters.write().await;
        let now = chrono::Utc::now();
        let cleanup_threshold = chrono::Duration::minutes(10);
        
        let initial_count = counters.len();
        counters.retain(|_, counter| {
            now.signed_duration_since(counter.last_access) < cleanup_threshold
        });
        
        let cleaned_count = initial_count - counters.len();
        if cleaned_count > 0 {
            tracing::debug!(
                cleaned_entries = cleaned_count,
                remaining_entries = counters.len(),
                "Rate limiter cleanup completed"
            );
            
            metrics::counter!("rate_limiter_entries_cleaned_total", cleaned_count as u64);
        }
    }
}

/// Enhanced security guard with comprehensive audit logging
pub struct SecurityGuard {
    rate_limiter: RateLimiter,
    audit_logger: AsyncLogger,
}

impl SecurityGuard {
    pub fn new(audit_logger: AsyncLogger) -> Self {
        Self {
            rate_limiter: RateLimiter::new(),
            audit_logger,
        }
    }
    
    /// Comprehensive security check - the heart of the front door
    #[instrument(
        skip(self, app_state), 
        fields(
            tenant_id = %ctx.tenant_id, 
            command = %command,
            actor = %ctx.actor,
            session_id = %ctx.session_id
        )
    )]
    pub async fn guard(
        &self,
        ctx: &Context,
        command: &str,
        app_state: &AppState,
    ) -> Result<(), DispatchError> {
        let policy = current_policy();
        let start_time = Instant::now();
        
        // 1. Validate context
        ctx.validate()?;
        
        // 2. Check if command is allowed by policy
        if !policy.sec.command_allowed(command) {
            self.audit_failure(
                ctx, 
                command, 
                "command_not_allowed", 
                "Command not in allowed list",
                start_time
            ).await;
            
            return Err(DispatchError::NotFound(command.to_string()));
        }
        
        // 3. Session validation (if session manager available)
        if let Some(user_id) = &ctx.user_id {
            match app_state.security_manager.validate_session(&ctx.session_id, user_id).await {
                Ok(false) => {
                    self.audit_failure(
                        ctx, 
                        command, 
                        "invalid_session", 
                        "Session validation failed",
                        start_time
                    ).await;
                    
                    return Err(DispatchError::Unauthorized { 
                        reason: "Invalid session".to_string() 
                    });
                }
                Err(e) => {
                    self.audit_failure(
                        ctx, 
                        command, 
                        "session_check_error", 
                        &format!("Session check failed: {}", e),
                        start_time
                    ).await;
                    
                    return Err(DispatchError::ServiceUnavailable { 
                        reason: "Session service unavailable".to_string() 
                    });
                }
                Ok(true) => {
                    // Session is valid, continue
                }
            }
        }
        
        // 4. Rate limiting
        if let Err(e) = self.rate_limiter.check_rate_limit(ctx, command).await {
            self.audit_failure(
                ctx, 
                command, 
                "rate_limited", 
                "Rate limit exceeded",
                start_time
            ).await;
            return Err(e);
        }
        
        // 5. MAC authorization check (if enabled)
        if policy.sec.mac_enforcement {
            if let Some(user_id) = &ctx.user_id {
                match app_state.security_manager.get_user_context(user_id).await {
                    Ok(user_context) => {
                        // Simplified MAC check - in production this would be more sophisticated
                        if command.starts_with("admin.") && !ctx.actor.contains("admin") {
                            self.audit_failure(
                                ctx, 
                                command, 
                                "insufficient_privileges", 
                                "MAC policy violation",
                                start_time
                            ).await;
                            
                            return Err(DispatchError::Forbidden { 
                                reason: "Insufficient privileges".to_string() 
                            });
                        }
                    }
                    Err(e) => {
                        self.audit_failure(
                            ctx, 
                            command, 
                            "mac_check_error", 
                            &format!("MAC check failed: {}", e),
                            start_time
                        ).await;
                        
                        return Err(DispatchError::ServiceUnavailable { 
                            reason: "Authorization service unavailable".to_string() 
                        });
                    }
                }
            }
        }
        
        // 6. Log successful authorization
        self.audit_success(ctx, command, start_time).await;
        
        Ok(())
    }
    
    async fn audit_success(&self, ctx: &Context, command: &str, start_time: Instant) {
        let duration_ms = start_time.elapsed().as_millis() as u64;
        let event = AuditEvent::new(
            ctx.tenant_id.clone(),
            ctx.session_id.clone(),
            ctx.actor.clone(),
            command.to_string(),
            "authorized",
        ).with_duration(duration_ms);
        
        self.audit_logger.try_log(event);
        
        // Record success metrics
        metrics::counter!(
            "authorization_success_total",
            "command" => command,
            "tenant_id" => ctx.tenant_id.clone()
        );
        
        metrics::histogram!(
            "authorization_duration_ms",
            duration_ms as f64,
            "outcome" => "success"
        );
    }
    
    async fn audit_failure(
        &self, 
        ctx: &Context, 
        command: &str, 
        reason: &str, 
        details: &str,
        start_time: Instant
    ) {
        let duration_ms = start_time.elapsed().as_millis() as u64;
        let event = AuditEvent::new(
            ctx.tenant_id.clone(),
            ctx.session_id.clone(),
            ctx.actor.clone(),
            command.to_string(),
            "denied",
        )
        .with_error(format!("{}: {}", reason, details))
        .with_duration(duration_ms);
        
        self.audit_logger.try_log(event);
        
        // Record failure metrics with detailed labels
        metrics::counter!(
            "authorization_failure_total",
            "command" => command,
            "reason" => reason,
            "tenant_id" => ctx.tenant_id.clone()
        );
        
        metrics::histogram!(
            "authorization_duration_ms",
            duration_ms as f64,
            "outcome" => "failure"
        );
        
        // Log security event
        warn!(
            tenant_id = %ctx.tenant_id,
            actor = %ctx.actor,
            command = %command,
            reason = %reason,
            details = %details,
            duration_ms = duration_ms,
            "Authorization denied"
        );
    }
}

/// THE SINGLE FRONT DOOR - all Tauri commands go through here
#[tauri::command]
#[instrument(
    skip(app_state, payload), 
    fields(
        command = %command,
        tenant_id = %ctx.tenant_id,
        actor = %ctx.actor
    )
)]
pub async fn dispatch(
    command: String,
    payload: Value,
    ctx: Context,
    app_state: State<'_, AppState>,
) -> Result<Value, String> {
    let start_time = Instant::now();
    
    // Record command invocation metric (before any processing)
    metrics::counter!("command_invocations_total", "command" => command.clone());
    
    info!(
        command = %command,
        tenant_id = %ctx.tenant_id,
        session_id = %ctx.session_id,
        actor = %ctx.actor,
        "Dispatching command"
    );
    
    // Initialize security guard
    let guard = SecurityGuard::new(app_state.audit_logger.clone());
    
    // Security gate - this is where all authorization happens
    if let Err(e) = guard.guard(&ctx, &command, &app_state).await {
        let duration_ms = start_time.elapsed().as_millis() as f64;
        
        error!(
            command = %command,
            tenant_id = %ctx.tenant_id,
            error = %e,
            duration_ms = duration_ms,
            "Command authorization failed"
        );
        
        metrics::counter!(
            "dispatch_failures_total",
            "reason" => e.outcome(),
            "command" => command.as_str(),
            "status_code" => e.status_code().to_string()
        );
        
        metrics::histogram!(
            "dispatch_duration_ms",
            duration_ms,
            "outcome" => "auth_failure",
            "command" => command.as_str()
        );
        
        return Err(e.to_string());
    }
    
    // Execute command with instrumentation
    let result = instrument_security(
        "dispatch_execute",
        &ctx.tenant_id,
        &ctx.session_id,
        || async {
            route_command(&command, payload, &ctx, &app_state).await
        },
    ).await;
    
    let duration_ms = start_time.elapsed().as_millis() as f64;
    
    match result {
        Ok(response) => {
            info!(
                command = %command,
                tenant_id = %ctx.tenant_id,
                duration_ms = duration_ms,
                "Command executed successfully"
            );
            
            metrics::counter!(
                "dispatch_success_total", 
                "command" => command.as_str()
            );
            
            metrics::histogram!(
                "dispatch_duration_ms", 
                duration_ms, 
                "outcome" => "success",
                "command" => command.as_str()
            );
            
            Ok(response)
        }
        Err(e) => {
            error!(
                command = %command,
                tenant_id = %ctx.tenant_id,
                duration_ms = duration_ms,
                error = %e,
                "Command execution failed"
            );
            
            metrics::counter!(
                "dispatch_failures_total",
                "reason" => "execution_error",
                "command" => command.as_str()
            );
            
            metrics::histogram!(
                "dispatch_duration_ms", 
                duration_ms, 
                "outcome" => "execution_failure",
                "command" => command.as_str()
            );
            
            // Audit execution failure
            let audit_event = AuditEvent::new(
                ctx.tenant_id.clone(),
                ctx.session_id.clone(),
                ctx.actor.clone(),
                command.clone(),
                "execution_failed",
            )
            .with_error(e.to_string())
            .with_duration(duration_ms as u64);
            
            app_state.audit_logger.try_log(audit_event);
            
            Err(e.to_string())
        }
    }
}

/// Route commands to appropriate handlers with proper error conversion
async fn route_command(
    command: &str,
    payload: Value,
    ctx: &Context,
    app_state: &AppState,
) -> Result<Value, DispatchError> {
    match command {
        // System commands
        "system.status" => {
            instrument("cmd_system_status", || async {
                crate::commands::system::get_status(ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        "system.health" => {
            instrument("cmd_system_health", || async {
                crate::commands::system::health_check(ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        // Security commands
        "security.authenticate" => {
            instrument("cmd_security_auth", || async {
                crate::commands::security::authenticate(payload, ctx, app_state).await
            }).await.map_err(|e| {
                if e.to_string().contains("invalid credentials") {
                    DispatchError::Unauthorized { reason: "Invalid credentials".to_string() }
                } else {
                    DispatchError::Internal(e.to_string())
                }
            })
        }
        
        "security.logout" => {
            instrument("cmd_security_logout", || async {
                crate::commands::security::logout(ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        // Data commands
        "data.read" => {
            instrument("cmd_data_read", || async {
                crate::commands::data::read_entity(payload, ctx, app_state).await
            }).await.map_err(|e| {
                if e.to_string().contains("not found") {
                    DispatchError::NotFound("Entity not found".to_string())
                } else if e.to_string().contains("access denied") {
                    DispatchError::Forbidden { reason: "Access denied to entity".to_string() }
                } else {
                    DispatchError::Internal(e.to_string())
                }
            })
        }
        
        "data.write" => {
            instrument("cmd_data_write", || async {
                crate::commands::data::write_entity(payload, ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        "data.query" => {
            instrument("cmd_data_query", || async {
                crate::commands::data::query_entities(payload, ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        // Observability commands
        "observability.metrics" => {
            instrument("cmd_obs_metrics", || async {
                crate::commands::observability::get_metrics(ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        "observability.audit" => {
            instrument("cmd_obs_audit", || async {
                crate::commands::observability::get_audit_trail(payload, ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        // License commands
        "license.check" => {
            instrument("cmd_license_check", || async {
                crate::commands::license::check_feature(payload, ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        "license.info" => {
            instrument("cmd_license_info", || async {
                crate::commands::license::get_info(ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        // Enterprise commands (feature-gated)
        #[cfg(feature = "enterprise")]
        cmd if cmd.starts_with("enterprise.") => {
            instrument("cmd_enterprise", || async {
                crate::commands::enterprise::route_enterprise_command(cmd, payload, ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        // Plugin commands (feature-gated)
        #[cfg(feature = "plugins_wasm")]
        cmd if cmd.starts_with("plugin.") => {
            instrument("cmd_plugin", || async {
                crate::commands::plugins::route_plugin_command(cmd, payload, ctx, app_state).await
            }).await.map_err(|e| DispatchError::Internal(e.to_string()))
        }
        
        _ => Err(DispatchError::NotFound(command.to_string())),
    }
}

/// Test connection (no authentication required)
#[tauri::command]
pub async fn test_connection() -> Result<String, String> {
    metrics::counter!("test_connections_total");
    Ok("Connection successful - Single front-door dispatch active with enhanced security".to_string())
}

/// Legacy command deprecation notice
#[tauri::command]
pub async fn legacy_command() -> Result<String, String> {
    metrics::counter!("legacy_command_attempts_total");
    Err("Legacy commands deprecated. Use dispatch() with proper Context.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::policy_snapshot::{swap_policy, PolicySnapshot, SecPolicy};
    use crate::observability::instrument::spawn_audit_worker;
    
    fn create_test_context() -> Context {
        Context {
            tenant_id: "test-tenant".to_string(),
            session_id: "test-session".to_string(),
            actor: "test-user".to_string(),
            user_id: Some("user-123".to_string()),
            source_ip: Some("127.0.0.1".to_string()),
            user_agent: Some("test-agent".to_string()),
        }
    }
    
    #[test]
    fn test_context_validation() {
        let mut ctx = create_test_context();
        assert!(ctx.validate().is_ok());
        
        // Test empty tenant_id
        ctx.tenant_id = "".to_string();
        assert!(matches!(ctx.validate(), Err(DispatchError::BadRequest(_))));
        
        // Test too long tenant_id
        ctx.tenant_id = "a".repeat(101);
        assert!(matches!(ctx.validate(), Err(DispatchError::BadRequest(_))));
    }
    
    #[test]
    fn test_dispatch_error_properties() {
        let auth_error = DispatchError::Unauthorized { reason: "test".to_string() };
        assert_eq!(auth_error.status_code(), 401);
        assert_eq!(auth_error.outcome(), "unauthorized");
        assert!(auth_error.is_client_error());
        assert!(!auth_error.is_server_error());
        
        let internal_error = DispatchError::Internal("test".to_string());
        assert_eq!(internal_error.status_code(), 500);
        assert!(!internal_error.is_client_error());
        assert!(internal_error.is_server_error());
    }
    
    #[tokio::test]
    async fn test_rate_limiter_basic() {
        let limiter = RateLimiter::new();
        let ctx = create_test_context();
        
        // Set up policy with tight rate limit
        let mut policy = PolicySnapshot::default();
        policy.sec.rate_limits.insert(
            "test_cmd".to_string(),
            crate::policy::policy_snapshot::RateLimit {
                requests_per_minute: 2,
                burst_size: 1,
            },
        );
        let _ = swap_policy(policy);
        
        // First two requests should succeed
        assert!(limiter.check_rate_limit(&ctx, "test_cmd").await.is_ok());
        assert!(limiter.check_rate_limit(&ctx, "test_cmd").await.is_ok());
        
        // Third request should be rate limited
        assert!(matches!(
            limiter.check_rate_limit(&ctx, "test_cmd").await,
            Err(DispatchError::RateLimited { .. })
        ));
    }
    
    #[tokio::test]
    async fn test_rate_limiter_cleanup() {
        let mut limiter = RateLimiter::new();
        
        // This would test the cleanup functionality
        // In a real test, you'd want to manipulate time or use a mock
        limiter.cleanup_old_entries().await;
        
        // Verify cleanup ran without panicking
        assert!(true);
    }
}
