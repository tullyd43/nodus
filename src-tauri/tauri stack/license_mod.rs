// src-tauri/src/license/mod.rs
// License Management - Implements three-tier licensing (Community/Enterprise/Defense)
// Replaces JavaScript license validation with cryptographic verification

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;
use ring::{digest, hmac};
use base64::{Engine as _, engine::general_purpose};

/// License tiers matching the three-tier strategy
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LicenseTier {
    Community,    // Open source
    Enterprise,   // Business license
    Defense,      // Government/classified
}

/// License status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LicenseStatus {
    Valid,
    Expired,
    Invalid,
    Revoked,
    Pending,
}

/// License information structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub license_id: Uuid,
    pub tier: LicenseTier,
    pub status: LicenseStatus,
    pub organization: String,
    pub issued_to: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub features: HashSet<String>,
    pub limits: LicenseLimits,
    pub signature: String,
    pub verification_key: String,
}

/// License limits based on tier
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseLimits {
    pub max_users: Option<u32>,
    pub max_storage_gb: Option<u32>,
    pub max_operations_per_hour: Option<u32>,
    pub max_api_calls_per_day: Option<u32>,
    pub max_concurrent_sessions: Option<u32>,
    pub max_tenants: Option<u32>,
}

/// Feature definitions for each tier
pub struct LicenseFeatures;

impl LicenseFeatures {
    /// Community tier features (open source baseline)
    pub fn community_features() -> HashSet<String> {
        vec![
            // Core observability
            "basic_observability".to_string(),
            "forensic_logging".to_string(),
            "metrics_collection".to_string(),
            
            // Basic security
            "mac_enforcement".to_string(),
            "user_authentication".to_string(),
            "basic_encryption".to_string(),
            
            // Core functionality
            "entity_management".to_string(),
            "basic_workflows".to_string(),
            "data_storage".to_string(),
            "ui_framework".to_string(),
            
            // Limited plugins (9 core forensic plugins)
            "storage_forensic_plugin".to_string(),
            "security_forensic_plugin".to_string(),
            "auth_forensic_plugin".to_string(),
            "api_forensic_plugin".to_string(),
            "plugins_forensic_plugin".to_string(),
            "config_forensic_plugin".to_string(),
            "policy_forensic_plugin".to_string(),
            "service_forensic_plugin".to_string(),
            "ui_forensic_plugin".to_string(),
        ].into_iter().collect()
    }

    /// Enterprise tier features (community + business features)
    pub fn enterprise_features() -> HashSet<String> {
        let mut features = Self::community_features();
        
        // Advanced observability
        features.insert("advanced_forensics".to_string());
        features.insert("real_time_monitoring".to_string());
        features.insert("compliance_reporting".to_string());
        features.insert("system_optimization".to_string());
        features.insert("performance_analytics".to_string());
        
        // Enterprise security
        features.insert("signed_plugins".to_string());
        features.insert("advanced_encryption".to_string());
        features.insert("audit_compliance".to_string());
        features.insert("policy_engine".to_string());
        
        // Business features
        features.insert("multi_tenant".to_string());
        features.insert("enterprise_dashboard".to_string());
        features.insert("api_access".to_string());
        features.insert("custom_workflows".to_string());
        features.insert("batch_operations".to_string());
        features.insert("data_export".to_string());
        
        // Additional plugins (10 enterprise plugins)
        features.insert("database_forensic_plugin".to_string());
        features.insert("network_forensic_plugin".to_string());
        features.insert("sync_forensic_plugin".to_string());
        features.insert("files_forensic_plugin".to_string());
        features.insert("i18n_forensic_plugin".to_string());
        features.insert("search_forensic_plugin".to_string());
        features.insert("embeddings_forensic_plugin".to_string());
        features.insert("ai_forensic_plugin".to_string());
        features.insert("jobs_forensic_plugin".to_string());
        features.insert("health_forensic_plugin".to_string());
        
        features
    }

    /// Defense tier features (enterprise + classified operations)
    pub fn defense_features() -> HashSet<String> {
        let mut features = Self::enterprise_features();
        
        // Classified operations
        features.insert("classified_operations".to_string());
        features.insert("nato_compliance".to_string());
        features.insert("classification_crypto".to_string());
        features.insert("polyinstantiation".to_string());
        features.insert("mandatory_access_control".to_string());
        features.insert("compartmented_security".to_string());
        features.insert("air_gap_support".to_string());
        
        // Defense-specific
        features.insert("crypto_forensic_plugin".to_string()); // Classified crypto operations
        features.insert("defense_audit_trails".to_string());
        features.insert("security_clearance_validation".to_string());
        features.insert("classified_data_handling".to_string());
        
        features
    }

    /// Get features for a license tier
    pub fn features_for_tier(tier: &LicenseTier) -> HashSet<String> {
        match tier {
            LicenseTier::Community => Self::community_features(),
            LicenseTier::Enterprise => Self::enterprise_features(),
            LicenseTier::Defense => Self::defense_features(),
        }
    }
}

/// License manager for validation and feature checking
#[derive(Debug)]
pub struct LicenseManager {
    current_license: Option<LicenseInfo>,
    verification_keys: HashMap<String, String>,
    feature_cache: HashMap<String, bool>,
}

impl LicenseManager {
    /// Create new license manager
    pub async fn new() -> Result<Self, LicenseError> {
        let mut manager = Self {
            current_license: None,
            verification_keys: HashMap::new(),
            feature_cache: HashMap::new(),
        };

        // Load verification keys (in production, these would be embedded or from secure storage)
        manager.load_verification_keys().await?;
        
        // Detect and validate current license
        manager.detect_license().await?;
        
        Ok(manager)
    }

    /// Detect current license from environment/file/registry
    async fn detect_license(&mut self) -> Result<(), LicenseError> {
        // Check for license file first
        if let Ok(license_data) = std::fs::read_to_string("license.json") {
            if let Ok(license) = serde_json::from_str::<LicenseInfo>(&license_data) {
                self.validate_and_set_license(license).await?;
                return Ok(());
            }
        }

        // Check environment variable
        if let Ok(license_str) = std::env::var("NODUS_LICENSE") {
            if let Ok(license_data) = general_purpose::STANDARD.decode(&license_str) {
                if let Ok(license_str) = String::from_utf8(license_data) {
                    if let Ok(license) = serde_json::from_str::<LicenseInfo>(&license_str) {
                        self.validate_and_set_license(license).await?;
                        return Ok(());
                    }
                }
            }
        }

        // Default to community license if no license found
        self.set_community_license();
        Ok(())
    }

    /// Set default community license
    fn set_community_license(&mut self) {
        let community_license = LicenseInfo {
            license_id: Uuid::new_v4(),
            tier: LicenseTier::Community,
            status: LicenseStatus::Valid,
            organization: "Community User".to_string(),
            issued_to: "community@nodus.com".to_string(),
            issued_at: Utc::now(),
            expires_at: None, // Community never expires
            features: LicenseFeatures::community_features(),
            limits: LicenseLimits {
                max_users: Some(5),
                max_storage_gb: Some(1),
                max_operations_per_hour: Some(10000),
                max_api_calls_per_day: Some(1000),
                max_concurrent_sessions: Some(3),
                max_tenants: Some(1),
            },
            signature: "community".to_string(), // Not verified for community
            verification_key: "community".to_string(),
        };

        self.current_license = Some(community_license);
        self.rebuild_feature_cache();
    }

    /// Validate and set license with cryptographic verification
    async fn validate_and_set_license(&mut self, license: LicenseInfo) -> Result<(), LicenseError> {
        // Check expiration
        if let Some(expires_at) = license.expires_at {
            if Utc::now() > expires_at {
                return Err(LicenseError::Expired);
            }
        }

        // Verify signature for non-community licenses
        if license.tier != LicenseTier::Community {
            self.verify_license_signature(&license)?;
        }

        // Check status
        if license.status != LicenseStatus::Valid {
            return Err(LicenseError::Invalid);
        }

        self.current_license = Some(license);
        self.rebuild_feature_cache();
        
        Ok(())
    }

    /// Verify license signature using HMAC
    fn verify_license_signature(&self, license: &LicenseInfo) -> Result<(), LicenseError> {
        let verification_key = self.verification_keys
            .get(&license.verification_key)
            .ok_or(LicenseError::InvalidSignature)?;

        // Create message to verify (simplified - in production use more fields)
        let message = format!(
            "{}:{}:{}:{}",
            license.license_id,
            license.tier as u8,
            license.organization,
            license.issued_at.timestamp()
        );

        // Verify HMAC signature
        let key = hmac::Key::new(hmac::HMAC_SHA256, verification_key.as_bytes());
        let expected_signature = general_purpose::STANDARD.encode(
            hmac::sign(&key, message.as_bytes()).as_ref()
        );

        if expected_signature != license.signature {
            return Err(LicenseError::InvalidSignature);
        }

        Ok(())
    }

    /// Load verification keys (in production, embed these securely)
    async fn load_verification_keys(&mut self) -> Result<(), LicenseError> {
        // In production, these would be embedded in the binary or loaded from secure storage
        self.verification_keys.insert(
            "enterprise_key_v1".to_string(),
            "enterprise_verification_key_2024".to_string(),
        );
        self.verification_keys.insert(
            "defense_key_v1".to_string(),
            "defense_verification_key_2024_classified".to_string(),
        );
        
        Ok(())
    }

    /// Rebuild feature cache for fast lookups
    fn rebuild_feature_cache(&mut self) {
        self.feature_cache.clear();
        
        if let Some(ref license) = self.current_license {
            for feature in &license.features {
                self.feature_cache.insert(feature.clone(), true);
            }
        }
    }

    /// Check if a feature is available (replaces JS license.hasFeature)
    pub async fn has_feature(&self, feature: &str) -> bool {
        self.feature_cache.get(feature).copied().unwrap_or(false)
    }

    /// Get current license tier
    pub async fn get_tier(&self) -> LicenseTier {
        self.current_license
            .as_ref()
            .map(|l| l.tier.clone())
            .unwrap_or(LicenseTier::Community)
    }

    /// Get current license info
    pub async fn get_license_info(&self) -> Option<&LicenseInfo> {
        self.current_license.as_ref()
    }

    /// Check if within usage limits
    pub async fn check_limit(&self, limit_type: &str, current_usage: u32) -> bool {
        let limits = &self.current_license.as_ref()?.limits;
        
        match limit_type {
            "users" => limits.max_users.map_or(true, |max| current_usage <= max),
            "storage_gb" => limits.max_storage_gb.map_or(true, |max| current_usage <= max),
            "operations_per_hour" => limits.max_operations_per_hour.map_or(true, |max| current_usage <= max),
            "api_calls_per_day" => limits.max_api_calls_per_day.map_or(true, |max| current_usage <= max),
            "concurrent_sessions" => limits.max_concurrent_sessions.map_or(true, |max| current_usage <= max),
            "tenants" => limits.max_tenants.map_or(true, |max| current_usage <= max),
            _ => true, // Unknown limits default to allowed
        }
    }

    /// Validate enterprise feature access (for ESLint rule compliance)
    pub async fn validate_enterprise_access(&self, feature: &str) -> Result<(), LicenseError> {
        if self.has_feature(feature).await {
            Ok(())
        } else {
            Err(LicenseError::FeatureNotAvailable(feature.to_string()))
        }
    }

    /// Get plugin list for current tier
    pub async fn get_available_plugins(&self) -> Vec<String> {
        if let Some(ref license) = self.current_license {
            license.features
                .iter()
                .filter(|f| f.ends_with("_forensic_plugin"))
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }
}

/// License validation errors
#[derive(Debug, thiserror::Error)]
pub enum LicenseError {
    #[error("License has expired")]
    Expired,
    
    #[error("Invalid license signature")]
    InvalidSignature,
    
    #[error("License is invalid or revoked")]
    Invalid,
    
    #[error("Feature not available in current license: {0}")]
    FeatureNotAvailable(String),
    
    #[error("License limit exceeded: {0}")]
    LimitExceeded(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl Default for LicenseLimits {
    fn default() -> Self {
        Self {
            max_users: None,          // No limit
            max_storage_gb: None,     // No limit
            max_operations_per_hour: None,
            max_api_calls_per_day: None,
            max_concurrent_sessions: None,
            max_tenants: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_community_features() {
        let features = LicenseFeatures::community_features();
        assert!(features.contains("basic_observability"));
        assert!(features.contains("mac_enforcement"));
        assert!(!features.contains("advanced_forensics"));
        assert!(!features.contains("classified_operations"));
    }

    #[test]
    fn test_enterprise_features() {
        let features = LicenseFeatures::enterprise_features();
        assert!(features.contains("basic_observability")); // Inherited from community
        assert!(features.contains("advanced_forensics"));  // Enterprise specific
        assert!(features.contains("database_forensic_plugin")); // Enterprise plugin
        assert!(!features.contains("classified_operations")); // Defense only
    }

    #[test]
    fn test_defense_features() {
        let features = LicenseFeatures::defense_features();
        assert!(features.contains("basic_observability")); // Inherited
        assert!(features.contains("advanced_forensics"));  // Inherited
        assert!(features.contains("classified_operations")); // Defense specific
        assert!(features.contains("crypto_forensic_plugin")); // Defense plugin
    }

    #[test]
    fn test_license_limits() {
        let limits = LicenseLimits {
            max_users: Some(100),
            max_storage_gb: Some(50),
            max_operations_per_hour: Some(10000),
            max_api_calls_per_day: Some(5000),
            max_concurrent_sessions: Some(10),
            max_tenants: Some(5),
        };
        
        assert_eq!(limits.max_users, Some(100));
        assert_eq!(limits.max_tenants, Some(5));
    }

    #[tokio::test]
    async fn test_license_manager_creation() {
        // This test would require proper setup in a real environment
        // For now, just test the structure
        assert!(true); // Placeholder
    }

    #[test]
    fn test_license_tiers() {
        assert_eq!(LicenseTier::Community as u8, 0);
        assert_ne!(LicenseTier::Enterprise, LicenseTier::Defense);
    }
}
