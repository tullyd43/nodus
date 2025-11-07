// src-tauri/src/security/mod.rs
// Nodus Security Module - Replaces all JS security files
// Maps to: SecurityManager.js, MACEngine.js, ClassificationCrypto.js, etc.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use thiserror::Error;
use constant_time_eq::constant_time_eq;
use std::fmt;

pub mod mac_engine;
pub mod classification_crypto;
pub mod security_manager;
// pub mod information_flow; // consolidated/not present as separate file
// pub mod tenant_policy; // consolidated/not present as separate file

pub use mac_engine::MACEngine;
pub use classification_crypto::ClassificationCrypto;
pub use security_manager::SecurityManager;
pub use information_flow::InformationFlowTracker;
pub use tenant_policy::TenantPolicyService;

/// Security classification levels (maps to your JS enum)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "classification_level")]
#[serde(rename_all = "lowercase")]
pub enum ClassificationLevel {
    Unclassified,
    Internal,
    Confidential, 
    Secret,
    NatoSecret,
}

impl ClassificationLevel {
    /// Convert to numeric rank for comparison (replaces JS level_rank function)
    pub fn rank(&self) -> u8 {
        match self {
            ClassificationLevel::Unclassified => 0,
            ClassificationLevel::Internal => 1,
            ClassificationLevel::Confidential => 2,
            ClassificationLevel::Secret => 3,
            ClassificationLevel::NatoSecret => 4,
        }
    }
    
    /// Parse from string (replaces JS string parsing)
    pub fn from_str(s: &str) -> Result<Self, SecurityError> {
        match s.to_lowercase().as_str() {
            "unclassified" => Ok(ClassificationLevel::Unclassified),
            "internal" => Ok(ClassificationLevel::Internal),
            "confidential" => Ok(ClassificationLevel::Confidential),
            "secret" => Ok(ClassificationLevel::Secret),
            "nato_secret" => Ok(ClassificationLevel::NatoSecret),
            _ => Err(SecurityError::InvalidClassification(s.to_string())),
        }
    }
}

impl fmt::Display for ClassificationLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            ClassificationLevel::Unclassified => "UNCLASSIFIED",
            ClassificationLevel::Internal => "INTERNAL",
            ClassificationLevel::Confidential => "CONFIDENTIAL",
            ClassificationLevel::Secret => "SECRET",
            ClassificationLevel::NatoSecret => "NATO_SECRET",
        };
        write!(f, "{}", s)
    }
}

/// Security label structure (replaces JS security label objects)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityLabel {
    pub level: ClassificationLevel,
    pub compartments: HashSet<String>,
}

impl SecurityLabel {
    pub fn new(level: ClassificationLevel, compartments: Vec<String>) -> Self {
        Self {
            level,
            compartments: compartments.into_iter().collect(),
        }
    }
    
    pub fn public() -> Self {
        Self::new(ClassificationLevel::Unclassified, vec![])
    }
}

/// User security context (replaces JS user context objects)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    pub user_id: Uuid,
    pub level: ClassificationLevel,
    pub compartments: HashSet<String>,
    pub expires: DateTime<Utc>,
    pub roles: Vec<String>,
    pub tenant_id: Option<Uuid>,
}

impl UserContext {
    pub fn is_valid(&self) -> bool {
        Utc::now() < self.expires
    }
    
    pub fn to_security_label(&self) -> SecurityLabel {
        SecurityLabel {
            level: self.level.clone(),
            compartments: self.compartments.clone(),
        }
    }
}

/// MAC operation types (replaces JS operation strings)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MACOperation {
    Read,
    Write,
}

/// Security errors (replaces JS Error objects)
#[derive(Error, Debug)]
pub enum SecurityError {
    #[error("Invalid classification: {0}")]
    InvalidClassification(String),
    
    #[error("MAC policy violation: {operation:?} access denied")]
    MACViolation { operation: MACOperation },
    
    #[error("User context expired")]
    ContextExpired,
    
    #[error("Insufficient clearance")]
    InsufficientClearance,
    
    #[error("Compartment access denied")]
    CompartmentDenied,
    
    #[error("Cryptographic operation failed: {0}")]
    CryptoError(String),
    
    #[error("License validation failed: {feature}")]
    LicenseError { feature: String },
}

/// Constant-time comparison utilities (replaces ct.js)
pub mod constant_time {
    use super::*;
    use std::time::{Duration, Instant};
    use tokio::time::sleep;
    
    /// Constant-time security operation wrapper (replaces constantTimeCheck)
    pub async fn security_operation<F, T, E>(
        operation: F,
        min_duration_ms: u64,
    ) -> Result<T, E>
    where
        F: std::future::Future<Output = Result<T, E>>,
    {
        let start = Instant::now();
        
        // Execute operation
        let result = operation.await;
        
        // Ensure minimum duration regardless of success/failure
        let elapsed = start.elapsed();
        let min_duration = Duration::from_millis(min_duration_ms);
        
        if elapsed < min_duration {
            let padding = min_duration - elapsed;
            sleep(padding).await;
        }
        
        result
    }
    
    /// Constant-time string comparison (replaces timing-vulnerable comparisons)
    pub fn compare_strings(a: &str, b: &str) -> bool {
        constant_time_eq(a.as_bytes(), b.as_bytes())
    }
}

/// Security event types for observability (replaces JS event types)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityEvent {
    ContextSet {
        user_id: Uuid,
        level: ClassificationLevel,
        compartments: Vec<String>,
        ttl: u64,
    },
    ContextCleared {
        user_id: Uuid,
    },
    ContextExpired {
        user_id: Uuid,
    },
    MACDecision {
        operation: MACOperation,
        subject: SecurityLabel,
        object: SecurityLabel,
        allowed: bool,
    },
    MACViolation {
        operation: MACOperation,
        subject: SecurityLabel,
        object: SecurityLabel,
        error_code: String,
    },
    LicenseValidated {
        feature: String,
        tier: String,
    },
    LicenseValidationFailed {
        feature: String,
        tier: String,
        error: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_classification_ranking() {
        assert!(ClassificationLevel::Secret.rank() > ClassificationLevel::Confidential.rank());
        assert!(ClassificationLevel::NatoSecret.rank() > ClassificationLevel::Secret.rank());
    }
    
    #[test] 
    fn test_security_label_creation() {
        let label = SecurityLabel::new(
            ClassificationLevel::Secret,
            vec!["ALPHA".to_string(), "BETA".to_string()]
        );
        assert_eq!(label.level, ClassificationLevel::Secret);
        assert!(label.compartments.contains("ALPHA"));
    }
    
    #[tokio::test]
    async fn test_constant_time_operation() {
        use std::time::Instant;
        
        let start = Instant::now();
        
        let _result = constant_time::security_operation(async {
            // Fast operation
            Ok::<(), SecurityError>(())
        }, 100).await;
        
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() >= 100);
    }
}
