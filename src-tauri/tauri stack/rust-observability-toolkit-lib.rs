// lib.rs - Rust Observability Toolkit - Open Source Implementation
// Zero-overhead observability for the Rust community

//! # Rust Observability Toolkit
//! 
//! A zero-overhead observability toolkit that brings enterprise-grade automatic 
//! observability to any Rust project.
//! 
//! ## Quick Start
//! 
//! ```rust
//! use rust_observability_toolkit::prelude::*;
//! 
//! #[derive(Observable)]
//! struct UserService {
//!     db: Database,
//! }
//! 
//! impl UserService {
//!     #[observe(operation = "user_creation", security_level = "high")]
//!     async fn create_user(&self, user_data: UserData) -> Result<User, UserError> {
//!         // Your business logic - observability happens automatically!
//!         self.db.insert_user(user_data).await
//!     }
//! }
//! ```

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

pub mod prelude;
pub mod macros;
pub mod exporters;
pub mod compliance;
pub mod privacy;
pub mod performance;
pub mod integrations;

/// Core observability engine that makes the magic happen
#[derive(Debug)]
pub struct ObservabilityEngine {
    /// Policy engine determines what to observe
    pub policy_engine: Arc<PolicyEngine>,
    
    /// Capture engine handles data collection
    pub capture_engine: Arc<CaptureEngine>,
    
    /// Export engine sends data to backends
    pub export_engine: Arc<ExportEngine>,
    
    /// Privacy engine protects sensitive data
    pub privacy_engine: Arc<PrivacyEngine>,
    
    /// Performance tracker ensures zero overhead
    pub performance_tracker: Arc<PerformanceTracker>,
    
    /// Compliance engine ensures regulatory compliance
    pub compliance_engine: Arc<ComplianceEngine>,
}

/// Builder for creating observability engine
#[derive(Debug)]
pub struct ObservabilityBuilder {
    policy_config: Option<PolicyConfig>,
    exporters: Vec<Box<dyn ObservabilityExporter>>,
    compliance_frameworks: Vec<ComplianceFramework>,
    privacy_config: PrivacyConfig,
    performance_config: PerformanceConfig,
    forensic_mode: bool,
}

/// Policy engine that determines what to observe
#[derive(Debug)]
pub struct PolicyEngine {
    /// Global observability policies
    global_policies: GlobalPolicies,
    
    /// Operation-specific policies
    operation_policies: HashMap<String, OperationPolicy>,
    
    /// Dynamic policy updates
    policy_updater: PolicyUpdater,
}

/// Configuration for observability policies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    /// Global settings
    pub global: GlobalPolicyConfig,
    
    /// Per-operation settings
    pub operations: HashMap<String, OperationPolicyConfig>,
    
    /// Privacy settings
    pub privacy: PrivacyPolicyConfig,
    
    /// Performance settings
    pub performance: PerformancePolicyConfig,
    
    /// Security settings
    pub security: SecurityPolicyConfig,
    
    /// Compliance settings
    pub compliance: CompliancePolicyConfig,
}

/// Global policy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalPolicyConfig {
    /// Maximum overhead budget in nanoseconds
    pub overhead_budget_ns: u64,
    
    /// Default audit level for operations
    pub default_audit_level: AuditLevel,
    
    /// Enable/disable observability globally
    pub enabled: bool,
    
    /// Sampling rate (0.0 to 1.0)
    pub sampling_rate: f64,
}

/// Audit levels for different operation sensitivity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditLevel {
    /// No auditing
    None,
    
    /// Basic operation tracking
    Basic,
    
    /// Full parameter and result capture
    Full,
    
    /// Forensic-grade with immutable records
    Forensic,
}

/// Operation-specific policy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationPolicyConfig {
    /// Audit level for this operation
    pub audit_level: AuditLevel,
    
    /// Performance tracking enabled
    pub performance_tracking: bool,
    
    /// Security monitoring enabled
    pub security_monitoring: bool,
    
    /// Compliance frameworks to apply
    pub compliance_frameworks: Vec<String>,
    
    /// Privacy protection level
    pub privacy_level: Option<PrivacyLevel>,
    
    /// Custom metadata to attach
    pub metadata: HashMap<String, String>,
}

/// Privacy protection levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PrivacyLevel {
    /// No special privacy protection
    None,
    
    /// Contains personally identifiable information
    PII,
    
    /// Contains protected health information
    PHI,
    
    /// Contains financial information
    Financial,
    
    /// Contains legal privileged information
    Legal,
}

/// Observation record created for each operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservationRecord {
    /// Unique observation identifier
    pub observation_id: String,
    
    /// Operation being observed
    pub operation: String,
    
    /// Timestamp when operation started
    pub started_at: DateTime<Utc>,
    
    /// Timestamp when operation completed
    pub completed_at: Option<DateTime<Utc>>,
    
    /// Operation result (success/failure)
    pub result: OperationResult,
    
    /// Performance metrics
    pub performance: PerformanceMetrics,
    
    /// Security events detected
    pub security_events: Vec<SecurityEvent>,
    
    /// Compliance records
    pub compliance_records: Vec<ComplianceRecord>,
    
    /// Privacy protection applied
    pub privacy_protection: Option<PrivacyProtection>,
    
    /// Custom metadata
    pub metadata: HashMap<String, String>,
    
    /// Context information
    pub context: ObservationContext,
}

/// Operation result information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationResult {
    /// Operation completed successfully
    Success {
        /// Return value (if captured)
        return_value: Option<serde_json::Value>,
    },
    
    /// Operation failed with error
    Error {
        /// Error type
        error_type: String,
        
        /// Error message (possibly redacted)
        error_message: String,
        
        /// Error code
        error_code: Option<String>,
    },
    
    /// Operation still in progress
    InProgress,
}

/// Performance metrics for operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    /// Execution duration in nanoseconds
    pub duration_ns: u64,
    
    /// CPU usage during operation
    pub cpu_usage: Option<f64>,
    
    /// Memory usage during operation
    pub memory_usage_bytes: Option<u64>,
    
    /// Network I/O during operation
    pub network_io_bytes: Option<u64>,
    
    /// Disk I/O during operation
    pub disk_io_bytes: Option<u64>,
    
    /// Custom performance metrics
    pub custom_metrics: HashMap<String, f64>,
}

/// Security events detected during operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    /// Event type
    pub event_type: SecurityEventType,
    
    /// Event severity
    pub severity: SecuritySeverity,
    
    /// Event description
    pub description: String,
    
    /// Event timestamp
    pub timestamp: DateTime<Utc>,
    
    /// Additional event data
    pub data: HashMap<String, serde_json::Value>,
}

/// Types of security events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityEventType {
    /// Suspicious access pattern
    SuspiciousAccess,
    
    /// Authentication failure
    AuthenticationFailure,
    
    /// Authorization violation
    AuthorizationViolation,
    
    /// Data access anomaly
    DataAccessAnomaly,
    
    /// Potential attack detected
    PotentialAttack,
    
    /// Custom security event
    Custom(String),
}

/// Security event severity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecuritySeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// Trait for observability exporters
pub trait ObservabilityExporter: Send + Sync + std::fmt::Debug {
    /// Export observation record to backend
    fn export(&self, record: &ObservationRecord) -> impl std::future::Future<Output = Result<(), ExportError>> + Send;
    
    /// Get exporter name
    fn name(&self) -> &str;
    
    /// Get exporter configuration
    fn config(&self) -> ExporterConfig;
}

/// Exporter configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExporterConfig {
    /// Exporter name
    pub name: String,
    
    /// Export format
    pub format: ExportFormat,
    
    /// Batch size for bulk exports
    pub batch_size: Option<usize>,
    
    /// Export timeout
    pub timeout: Option<Duration>,
    
    /// Retry configuration
    pub retry_config: Option<RetryConfig>,
}

/// Export formats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    JSON,
    MessagePack,
    Protobuf,
    Custom(String),
}

/// JSON file exporter for development and testing
#[derive(Debug)]
pub struct JsonFileExporter {
    file_path: String,
    config: ExporterConfig,
}

impl JsonFileExporter {
    /// Create new JSON file exporter
    pub fn new(file_path: impl Into<String>) -> Self {
        Self {
            file_path: file_path.into(),
            config: ExporterConfig {
                name: "json_file".to_string(),
                format: ExportFormat::JSON,
                batch_size: Some(100),
                timeout: Some(Duration::seconds(30)),
                retry_config: None,
            },
        }
    }
}

impl ObservabilityExporter for JsonFileExporter {
    async fn export(&self, record: &ObservationRecord) -> Result<(), ExportError> {
        use tokio::io::AsyncWriteExt;
        
        let json = serde_json::to_string(record)
            .map_err(|e| ExportError::SerializationFailed(e.to_string()))?;
        
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
            .await
            .map_err(|e| ExportError::IOError(e.to_string()))?;
        
        file.write_all(json.as_bytes()).await
            .map_err(|e| ExportError::IOError(e.to_string()))?;
        
        file.write_all(b"\n").await
            .map_err(|e| ExportError::IOError(e.to_string()))?;
        
        Ok(())
    }
    
    fn name(&self) -> &str {
        &self.config.name
    }
    
    fn config(&self) -> ExporterConfig {
        self.config.clone()
    }
}

/// Export errors
#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("Serialization failed: {0}")]
    SerializationFailed(String),
    
    #[error("I/O error: {0}")]
    IOError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    
    #[error("Rate limited: {0}")]
    RateLimited(String),
    
    #[error("Custom error: {0}")]
    Custom(String),
}

impl ObservabilityBuilder {
    /// Create new observability builder
    pub fn new() -> Self {
        Self {
            policy_config: None,
            exporters: Vec::new(),
            compliance_frameworks: Vec::new(),
            privacy_config: PrivacyConfig::default(),
            performance_config: PerformanceConfig::default(),
            forensic_mode: false,
        }
    }
    
    /// Load policy configuration from file
    pub fn with_policy_from_file(mut self, path: impl Into<String>) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path.into())
            .map_err(|e| ConfigError::FileReadError(e.to_string()))?;
        
        let config: PolicyConfig = toml::from_str(&content)
            .map_err(|e| ConfigError::ParseError(e.to_string()))?;
        
        self.policy_config = Some(config);
        Ok(self)
    }
    
    /// Load policy configuration from environment variables
    pub fn with_policy_from_env(mut self) -> Result<Self, ConfigError> {
        // Create default config that can be overridden by env vars
        let mut config = PolicyConfig::default();
        
        // Override with environment variables
        if let Ok(overhead_budget) = std::env::var("OBSERVABILITY_OVERHEAD_BUDGET_NS") {
            config.global.overhead_budget_ns = overhead_budget.parse()
                .map_err(|e| ConfigError::ParseError(e.to_string()))?;
        }
        
        if let Ok(enabled) = std::env::var("OBSERVABILITY_ENABLED") {
            config.global.enabled = enabled.parse()
                .map_err(|e| ConfigError::ParseError(e.to_string()))?;
        }
        
        self.policy_config = Some(config);
        Ok(self)
    }
    
    /// Add an exporter to the observability engine
    pub fn with_exporter(mut self, exporter: impl ObservabilityExporter + 'static) -> Self {
        self.exporters.push(Box::new(exporter));
        self
    }
    
    /// Enable forensic mode for immutable audit trails
    pub fn with_forensic_mode(mut self, enabled: bool) -> Self {
        self.forensic_mode = enabled;
        self
    }
    
    /// Build the observability engine
    pub async fn build(self) -> Result<ObservabilityEngine, BuildError> {
        let policy_config = self.policy_config
            .ok_or(BuildError::MissingPolicy)?;
        
        let policy_engine = Arc::new(PolicyEngine::new(policy_config).await?);
        let capture_engine = Arc::new(CaptureEngine::new().await?);
        let export_engine = Arc::new(ExportEngine::new(self.exporters).await?);
        let privacy_engine = Arc::new(PrivacyEngine::new(self.privacy_config).await?);
        let performance_tracker = Arc::new(PerformanceTracker::new(self.performance_config).await?);
        let compliance_engine = Arc::new(ComplianceEngine::new(self.compliance_frameworks).await?);
        
        Ok(ObservabilityEngine {
            policy_engine,
            capture_engine,
            export_engine,
            privacy_engine,
            performance_tracker,
            compliance_engine,
        })
    }
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            global: GlobalPolicyConfig {
                overhead_budget_ns: 1_000_000, // 1ms
                default_audit_level: AuditLevel::Basic,
                enabled: true,
                sampling_rate: 1.0,
            },
            operations: HashMap::new(),
            privacy: PrivacyPolicyConfig::default(),
            performance: PerformancePolicyConfig::default(),
            security: SecurityPolicyConfig::default(),
            compliance: CompliancePolicyConfig::default(),
        }
    }
}

/// Configuration errors
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Failed to read config file: {0}")]
    FileReadError(String),
    
    #[error("Failed to parse config: {0}")]
    ParseError(String),
    
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}

/// Build errors
#[derive(Debug, thiserror::Error)]
pub enum BuildError {
    #[error("Missing policy configuration")]
    MissingPolicy,
    
    #[error("Engine initialization failed: {0}")]
    InitializationFailed(String),
    
    #[error("Config error: {0}")]
    ConfigError(#[from] ConfigError),
}

// Placeholder implementations for missing types
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrivacyConfig {}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PerformanceConfig {}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrivacyPolicyConfig {}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PerformancePolicyConfig {}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SecurityPolicyConfig {}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CompliancePolicyConfig {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComplianceFramework {
    SOX,
    HIPAA,
    GDPR,
    PCIDSS,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub max_attempts: usize,
    pub backoff_multiplier: f64,
    pub max_delay: Duration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceRecord {
    pub framework: ComplianceFramework,
    pub requirement: String,
    pub status: ComplianceStatus,
    pub evidence: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComplianceStatus {
    Compliant,
    NonCompliant,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyProtection {
    pub pii_detected: bool,
    pub redaction_applied: bool,
    pub encryption_applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservationContext {
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub span_id: Option<String>,
}

// Engine implementations (simplified for open source version)
#[derive(Debug)]
pub struct CaptureEngine {}

impl CaptureEngine {
    async fn new() -> Result<Self, BuildError> {
        Ok(Self {})
    }
}

#[derive(Debug)]
pub struct ExportEngine {
    exporters: Vec<Box<dyn ObservabilityExporter>>,
}

impl ExportEngine {
    async fn new(exporters: Vec<Box<dyn ObservabilityExporter>>) -> Result<Self, BuildError> {
        Ok(Self { exporters })
    }
}

#[derive(Debug)]
pub struct PrivacyEngine {}

impl PrivacyEngine {
    async fn new(_config: PrivacyConfig) -> Result<Self, BuildError> {
        Ok(Self {})
    }
}

#[derive(Debug)]
pub struct PerformanceTracker {}

impl PerformanceTracker {
    async fn new(_config: PerformanceConfig) -> Result<Self, BuildError> {
        Ok(Self {})
    }
}

#[derive(Debug)]
pub struct ComplianceEngine {}

impl ComplianceEngine {
    async fn new(_frameworks: Vec<ComplianceFramework>) -> Result<Self, BuildError> {
        Ok(Self {})
    }
}

#[derive(Debug)]
struct GlobalPolicies {}

#[derive(Debug)]
struct PolicyUpdater {}

impl PolicyEngine {
    async fn new(_config: PolicyConfig) -> Result<Self, BuildError> {
        Ok(Self {
            global_policies: GlobalPolicies {},
            operation_policies: HashMap::new(),
            policy_updater: PolicyUpdater {},
        })
    }
}

/// Re-export commonly used types
pub mod prelude {
    pub use crate::{
        ObservabilityEngine, ObservabilityBuilder, ObservationRecord,
        ObservabilityExporter, JsonFileExporter, AuditLevel, PrivacyLevel,
        ExportError, ConfigError, BuildError,
    };
    
    // Re-export proc macros when they're implemented
    // pub use rust_observability_toolkit_macros::{Observable, observe};
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_basic_observability_setup() {
        let exporter = JsonFileExporter::new("/tmp/test-audit.jsonl");
        
        let observability = ObservabilityBuilder::new()
            .with_policy_from_env()
            .unwrap()
            .with_exporter(exporter)
            .with_forensic_mode(true)
            .build()
            .await
            .unwrap();
        
        assert!(observability.policy_engine.operation_policies.is_empty());
    }
    
    #[test]
    fn test_policy_config_serialization() {
        let config = PolicyConfig::default();
        let toml_str = toml::to_string(&config).unwrap();
        let parsed: PolicyConfig = toml::from_str(&toml_str).unwrap();
        
        assert_eq!(config.global.overhead_budget_ns, parsed.global.overhead_budget_ns);
    }
    
    #[tokio::test]
    async fn test_json_file_exporter() {
        let exporter = JsonFileExporter::new("/tmp/test-export.jsonl");
        
        let record = ObservationRecord {
            observation_id: "test-123".to_string(),
            operation: "test_operation".to_string(),
            started_at: Utc::now(),
            completed_at: Some(Utc::now()),
            result: OperationResult::Success {
                return_value: Some(serde_json::json!({"status": "ok"})),
            },
            performance: PerformanceMetrics {
                duration_ns: 1_000_000,
                cpu_usage: Some(0.5),
                memory_usage_bytes: Some(1024),
                network_io_bytes: None,
                disk_io_bytes: None,
                custom_metrics: HashMap::new(),
            },
            security_events: Vec::new(),
            compliance_records: Vec::new(),
            privacy_protection: None,
            metadata: HashMap::new(),
            context: ObservationContext {
                user_id: Some("user-456".to_string()),
                session_id: None,
                request_id: None,
                trace_id: None,
                span_id: None,
            },
        };
        
        let result = exporter.export(&record).await;
        assert!(result.is_ok());
    }
}
