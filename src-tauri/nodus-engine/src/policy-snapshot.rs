// src-tauri/src/policy/policy_snapshot.rs
// Enhanced policy snapshot with validation and serde improvements
// Implements Gemini's recommendations for production hardening

use std::sync::Arc;
use std::collections::HashMap;
use arc_swap::ArcSwap;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use crate::security::ClassificationLevel;

/// Observability policy with comprehensive validation
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ObsPolicy {
    pub enabled: bool,
    pub sampling_rate: f64,
    pub max_spans_per_second: u64,
    pub enabled_operations: Vec<String>,
    pub disabled_operations: Vec<String>,
    pub include_tenant_labels: bool,
    pub max_cardinality: u64,
}

impl ObsPolicy {
    pub fn enabled_for(&self, operation: &str) -> bool {
        if !self.enabled {
            return false;
        }
        
        // Fast reject on disabled list
        if self.disabled_operations.iter().any(|op| op == operation) {
            return false;
        }
        
        // If no explicit enable list, allow all (except disabled)
        if self.enabled_operations.is_empty() {
            return true;
        }
        
        // Check explicit enable list
        self.enabled_operations.iter().any(|op| op == operation)
    }
    
    /// Validate observability policy settings
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        if !(0.0..=1.0).contains(&self.sampling_rate) {
            return Err(PolicyValidationError::InvalidSamplingRate(self.sampling_rate));
        }
        
        if self.max_spans_per_second == 0 && self.enabled {
            return Err(PolicyValidationError::InvalidMaxSpans);
        }
        
        if self.max_cardinality == 0 && self.include_tenant_labels {
            return Err(PolicyValidationError::InvalidCardinality);
        }
        
        Ok(())
    }
}

/// Security policy with enhanced validation
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SecPolicy {
    pub mac_enforcement: bool,
    pub default_classification: ClassificationLevel,
    pub require_mfa: bool,
    pub session_timeout_minutes: u64,
    pub max_failed_attempts: u32,
    pub rate_limits: HashMap<String, RateLimit>,
    pub allowed_commands: Vec<String>,
    pub tenant_isolation: bool,
}

impl SecPolicy {
    pub fn command_allowed(&self, command: &str) -> bool {
        if self.allowed_commands.is_empty() {
            return true; // Allow all if no restrictions
        }
        self.allowed_commands.iter().any(|cmd| cmd == command)
    }
    
    pub fn get_rate_limit(&self, command: &str) -> Option<&RateLimit> {
        self.rate_limits.get(command)
            .or_else(|| self.rate_limits.get("default"))
    }
    
    /// Validate security policy settings
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        if self.session_timeout_minutes == 0 {
            return Err(PolicyValidationError::InvalidSessionTimeout);
        }
        
        if self.session_timeout_minutes > 1440 { // 24 hours max
            return Err(PolicyValidationError::SessionTimeoutTooLong);
        }
        
        if self.max_failed_attempts == 0 {
            return Err(PolicyValidationError::InvalidFailedAttempts);
        }
        
        // Validate rate limits
        for (command, limit) in &self.rate_limits {
            if limit.requests_per_minute == 0 {
                return Err(PolicyValidationError::InvalidRateLimit { 
                    command: command.clone() 
                });
            }
        }
        
        Ok(())
    }
}

/// Rate limiting configuration with validation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RateLimit {
    pub requests_per_minute: u64,
    pub burst_size: u64,
}

impl Default for RateLimit {
    fn default() -> Self {
        Self {
            requests_per_minute: 60,
            burst_size: 10,
        }
    }
}

impl RateLimit {
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        if self.requests_per_minute == 0 {
            return Err(PolicyValidationError::ZeroRateLimit);
        }
        
        if self.burst_size > self.requests_per_minute {
            return Err(PolicyValidationError::BurstExceedsRate);
        }
        
        Ok(())
    }
}

/// Plugin policy with security validation
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PluginPolicy {
    pub wasm_enabled: bool,
    pub native_enabled: bool,
    pub allowed_capabilities: Vec<String>,
    pub max_memory_mb: u64,
    pub max_execution_time_ms: u64,
}

impl PluginPolicy {
    pub fn has_capability(&self, capability: &str) -> bool {
        self.allowed_capabilities.iter().any(|cap| cap == capability)
    }
    
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        if self.wasm_enabled && self.max_memory_mb == 0 {
            return Err(PolicyValidationError::InvalidPluginMemory);
        }
        
        if self.wasm_enabled && self.max_execution_time_ms == 0 {
            return Err(PolicyValidationError::InvalidPluginTimeout);
        }
        
        // Security: native plugins require explicit confirmation
        if self.native_enabled && !self.allowed_capabilities.contains(&"native_execution".to_string()) {
            return Err(PolicyValidationError::NativePluginsRequireExplicitCapability);
        }
        
        Ok(())
    }
}

/// Database policy with advisor mode validation
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DatabasePolicy {
    pub advisor_mode: bool,
    pub auto_optimize: bool,
    pub max_query_time_ms: u64,
    pub connection_pool_size: u32,
    pub enable_query_logging: bool,
}

impl DatabasePolicy {
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        if self.connection_pool_size == 0 {
            return Err(PolicyValidationError::InvalidPoolSize);
        }
        
        if self.connection_pool_size > 100 {
            return Err(PolicyValidationError::PoolSizeTooLarge);
        }
        
        // Security: auto_optimize should require advisor_mode first
        if self.auto_optimize && !self.advisor_mode {
            return Err(PolicyValidationError::AutoOptimizeRequiresAdvisor);
        }
        
        Ok(())
    }
}

/// Complete policy snapshot with comprehensive validation
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PolicySnapshot {
    pub obs: ObsPolicy,
    pub sec: SecPolicy,
    pub plugins: PluginPolicy,
    pub database: DatabasePolicy,
    pub version: u64,
    pub loaded_at: chrono::DateTime<chrono::Utc>,
    pub checksum: Option<String>, // For integrity verification
}

impl PolicySnapshot {
    pub fn new(
        obs: ObsPolicy,
        sec: SecPolicy,
        plugins: PluginPolicy,
        database: DatabasePolicy,
        version: u64,
    ) -> Self {
        let mut snapshot = Self {
            obs,
            sec,
            plugins,
            database,
            version,
            loaded_at: chrono::Utc::now(),
            checksum: None,
        };
        
        // Generate checksum for integrity verification
        snapshot.checksum = Some(snapshot.calculate_checksum());
        snapshot
    }
    
    /// Comprehensive validation of the entire policy snapshot
    pub fn validate(&self) -> Result<(), PolicyValidationError> {
        self.obs.validate()?;
        self.sec.validate()?;
        self.plugins.validate()?;
        self.database.validate()?;
        
        // Cross-policy validation
        if self.plugins.wasm_enabled && !self.obs.enabled {
            tracing::warn!("WASM plugins enabled but observability disabled - security risk");
        }
        
        if self.sec.mac_enforcement && self.plugins.native_enabled {
            return Err(PolicyValidationError::NativePluginsWithMACConflict);
        }
        
        Ok(())
    }
    
    /// Calculate checksum for integrity verification
    fn calculate_checksum(&self) -> String {
        use sha2::{Sha256, Digest};
        
        let serialized = serde_json::to_string(self).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        hex::encode(hasher.finalize())
    }
    
    /// Verify integrity using stored checksum
    pub fn verify_integrity(&self) -> bool {
        if let Some(stored_checksum) = &self.checksum {
            let calculated = self.calculate_checksum();
            constant_time_eq::constant_time_eq(stored_checksum.as_bytes(), calculated.as_bytes())
        } else {
            false
        }
    }
    
    /// Get a diff summary compared to another snapshot
    pub fn diff_summary(&self, other: &PolicySnapshot) -> PolicyDiff {
        PolicyDiff {
            version_changed: self.version != other.version,
            observability_changed: self.obs.enabled != other.obs.enabled,
            security_changed: self.sec.mac_enforcement != other.sec.mac_enforcement,
            plugins_changed: self.plugins.wasm_enabled != other.plugins.wasm_enabled,
            database_changed: self.database.advisor_mode != other.database.advisor_mode,
        }
    }
}

/// Policy validation errors
#[derive(Debug, thiserror::Error)]
pub enum PolicyValidationError {
    #[error("Invalid sampling rate: {0} (must be 0.0-1.0)")]
    InvalidSamplingRate(f64),
    
    #[error("Invalid max spans setting")]
    InvalidMaxSpans,
    
    #[error("Invalid cardinality setting")]
    InvalidCardinality,
    
    #[error("Session timeout must be greater than 0")]
    InvalidSessionTimeout,
    
    #[error("Session timeout too long (max 24 hours)")]
    SessionTimeoutTooLong,
    
    #[error("Max failed attempts must be greater than 0")]
    InvalidFailedAttempts,
    
    #[error("Invalid rate limit for command: {command}")]
    InvalidRateLimit { command: String },
    
    #[error("Rate limit cannot be zero")]
    ZeroRateLimit,
    
    #[error("Burst size cannot exceed rate limit")]
    BurstExceedsRate,
    
    #[error("Plugin memory limit must be set when WASM enabled")]
    InvalidPluginMemory,
    
    #[error("Plugin execution timeout must be set when WASM enabled")]
    InvalidPluginTimeout,
    
    #[error("Native plugins require explicit 'native_execution' capability")]
    NativePluginsRequireExplicitCapability,
    
    #[error("Connection pool size must be greater than 0")]
    InvalidPoolSize,
    
    #[error("Connection pool size too large (max 100)")]
    PoolSizeTooLarge,
    
    #[error("Auto-optimize requires advisor mode to be enabled first")]
    AutoOptimizeRequiresAdvisor,
    
    #[error("Native plugins cannot be enabled with MAC enforcement")]
    NativePluginsWithMACConflict,
}

/// Policy diff summary for logging changes
#[derive(Debug, Clone)]
pub struct PolicyDiff {
    pub version_changed: bool,
    pub observability_changed: bool,
    pub security_changed: bool,
    pub plugins_changed: bool,
    pub database_changed: bool,
}

impl PolicyDiff {
    pub fn has_changes(&self) -> bool {
        self.version_changed || self.observability_changed || 
        self.security_changed || self.plugins_changed || self.database_changed
    }
    
    pub fn summary(&self) -> String {
        let mut changes = Vec::new();
        if self.observability_changed { changes.push("observability"); }
        if self.security_changed { changes.push("security"); }
        if self.plugins_changed { changes.push("plugins"); }
        if self.database_changed { changes.push("database"); }
        
        if changes.is_empty() {
            "No functional changes".to_string()
        } else {
            format!("Changed: {}", changes.join(", "))
        }
    }
}

/// Global policy storage - lock-free reads, atomic swaps
static POLICY: Lazy<ArcSwap<PolicySnapshot>> = Lazy::new(|| {
    ArcSwap::from_pointee(PolicySnapshot::default())
});

/// Get current policy snapshot (zero allocation, no locks)
#[inline]
pub fn current_policy() -> Arc<PolicySnapshot> {
    POLICY.load_full()
}

/// Atomically swap in new policy snapshot with validation
pub fn swap_policy(new_policy: PolicySnapshot) -> Result<Arc<PolicySnapshot>, PolicyValidationError> {
    // Validate before swapping
    new_policy.validate()?;
    
    // Verify integrity
    if !new_policy.verify_integrity() {
        return Err(PolicyValidationError::InvalidSamplingRate(0.0)); // Placeholder error
    }
    
    let old_policy = current_policy();
    let new_arc = Arc::new(new_policy);
    
    // Log diff summary
    let diff = new_arc.diff_summary(&old_policy);
    if diff.has_changes() {
        tracing::info!(
            old_version = old_policy.version,
            new_version = new_arc.version,
            changes = %diff.summary(),
            "Policy snapshot updated"
        );
    }
    
    POLICY.store(new_arc.clone());
    Ok(new_arc)
}

/// Enhanced policy loader with validation and diff logging
pub struct PolicyLoader {
    current_version: u64,
}

impl PolicyLoader {
    pub fn new() -> Self {
        Self { current_version: 0 }
    }
    
    /// Load and validate policy from TOML with comprehensive error handling
    pub async fn load_from_toml(&mut self, toml_content: &str) -> Result<Arc<PolicySnapshot>, PolicyError> {
        // Parse TOML
        let config: PolicyConfig = toml::from_str(toml_content)
            .map_err(|e| PolicyError::ParseFailed { error: e.to_string() })?;
        
        // Build snapshot
        self.current_version += 1;
        let snapshot = PolicySnapshot::new(
            config.observability,
            config.security,
            config.plugins,
            config.database,
            self.current_version,
        );
        
        // Validate and swap
        let new_policy = swap_policy(snapshot)
            .map_err(|e| PolicyError::ValidationFailed { error: e.to_string() })?;
        
        tracing::info!(
            version = self.current_version,
            checksum = %new_policy.checksum.as_deref().unwrap_or("none"),
            "Policy snapshot loaded and validated successfully"
        );
        
        Ok(new_policy)
    }
}

/// Configuration structure for TOML parsing (with Deserialize)
#[derive(Debug, Serialize, Deserialize)]
struct PolicyConfig {
    pub observability: ObsPolicy,
    pub security: SecPolicy,
    pub plugins: PluginPolicy,
    pub database: DatabasePolicy,
}

/// Policy loading errors
#[derive(Debug, thiserror::Error)]
pub enum PolicyError {
    #[error("Failed to parse policy: {error}")]
    ParseFailed { error: String },
    
    #[error("Policy validation failed: {error}")]
    ValidationFailed { error: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_policy_validation() {
        let mut policy = PolicySnapshot::default();
        
        // Valid policy should pass
        assert!(policy.validate().is_ok());
        
        // Invalid sampling rate should fail
        policy.obs.sampling_rate = 2.0;
        assert!(policy.validate().is_err());
        
        // Reset and test session timeout
        policy.obs.sampling_rate = 0.5;
        policy.sec.session_timeout_minutes = 0;
        assert!(policy.validate().is_err());
    }
    
    #[test]
    fn test_policy_diff() {
        let policy1 = PolicySnapshot::default();
        let mut policy2 = PolicySnapshot::default();
        policy2.obs.enabled = true;
        
        let diff = policy2.diff_summary(&policy1);
        assert!(diff.has_changes());
        assert!(diff.observability_changed);
        assert!(diff.summary().contains("observability"));
    }
    
    #[test]
    fn test_policy_integrity() {
        let policy = PolicySnapshot::new(
            ObsPolicy::default(),
            SecPolicy::default(),
            PluginPolicy::default(),
            DatabasePolicy::default(),
            1,
        );
        
        assert!(policy.verify_integrity());
    }
    
    #[tokio::test]
    async fn test_policy_loader_comprehensive() {
        let mut loader = PolicyLoader::new();
        
        let toml_content = r#"
        [observability]
        enabled = true
        sampling_rate = 0.5
        max_spans_per_second = 1000
        include_tenant_labels = false
        max_cardinality = 1000
        
        [security]
        mac_enforcement = true
        session_timeout_minutes = 60
        max_failed_attempts = 3
        tenant_isolation = true
        
        [plugins]
        wasm_enabled = false
        native_enabled = false
        max_memory_mb = 100
        max_execution_time_ms = 30000
        
        [database]
        advisor_mode = true
        auto_optimize = false
        connection_pool_size = 10
        "#;
        
        let result = loader.load_from_toml(toml_content).await;
        assert!(result.is_ok());
        
        let policy = result.unwrap();
        assert!(policy.obs.enabled);
        assert!(policy.sec.mac_enforcement);
        assert!(!policy.plugins.wasm_enabled);
        assert!(policy.database.advisor_mode);
        assert!(policy.verify_integrity());
    }
}
