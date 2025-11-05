// src-tauri/src/enterprise/mod.rs
// Enterprise Module Integration - Brings together all enterprise features
// Provides unified enterprise functionality with proper feature gating

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;

use crate::license::{LicenseManager, LicenseTier};
use crate::security::SecurityManager;
use crate::observability::{ForensicLogger, MetricsRegistry};
use crate::database::DatabaseManager;
use crate::state::AppState;

// Re-export enterprise modules
pub mod plugin_system;
pub mod compliance_dashboard;
pub mod multi_tenant;
pub mod api_gateway;

pub use plugin_system::EnterprisePluginSystem;
pub use compliance_dashboard::ComplianceDashboard;
pub use multi_tenant::MultiTenantSystem;
pub use api_gateway::EnterpriseAPIGateway;

/// Enterprise features manager - coordinates all enterprise functionality
#[derive(Debug)]
pub struct EnterpriseManager {
    /// Plugin system for signed plugins
    pub plugin_system: Option<Arc<EnterprisePluginSystem>>,
    
    /// Compliance dashboard for regulatory reporting
    pub compliance_dashboard: Option<Arc<ComplianceDashboard>>,
    
    /// Multi-tenant system for SaaS deployments
    pub multi_tenant_system: Option<Arc<MultiTenantSystem>>,
    
    /// API gateway for enterprise API management
    pub api_gateway: Option<Arc<EnterpriseAPIGateway>>,
    
    /// License manager for feature gating
    license_manager: Arc<LicenseManager>,
    
    /// Current enterprise features status
    features_status: Arc<RwLock<EnterpriseFeatureStatus>>,
}

/// Enterprise feature availability status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnterpriseFeatureStatus {
    pub license_tier: LicenseTier,
    pub plugin_system_available: bool,
    pub compliance_dashboard_available: bool,
    pub multi_tenant_available: bool,
    pub api_gateway_available: bool,
    pub last_checked: chrono::DateTime<chrono::Utc>,
}

/// Enterprise initialization configuration
#[derive(Debug, Clone)]
pub struct EnterpriseConfig {
    pub enable_plugin_system: bool,
    pub enable_compliance_dashboard: bool,
    pub enable_multi_tenant: bool,
    pub enable_api_gateway: bool,
    pub custom_config: serde_json::Value,
}

impl Default for EnterpriseConfig {
    fn default() -> Self {
        Self {
            enable_plugin_system: true,
            enable_compliance_dashboard: true,
            enable_multi_tenant: true,
            enable_api_gateway: true,
            custom_config: serde_json::Value::Null,
        }
    }
}

/// Enterprise errors
#[derive(Debug, thiserror::Error)]
pub enum EnterpriseError {
    #[error("Insufficient license for enterprise features: requires {required_license:?}")]
    InsufficientLicense { required_license: LicenseTier },
    
    #[error("Enterprise feature not available: {feature}")]
    FeatureNotAvailable { feature: String },
    
    #[error("Enterprise initialization failed: {reason}")]
    InitializationFailed { reason: String },
    
    #[error("Plugin system error: {error}")]
    PluginSystemError { error: String },
    
    #[error("Compliance dashboard error: {error}")]
    ComplianceDashboardError { error: String },
    
    #[error("Multi-tenant error: {error}")]
    MultiTenantError { error: String },
    
    #[error("API gateway error: {error}")]
    APIGatewayError { error: String },
}

impl EnterpriseManager {
    /// Create new enterprise manager with feature detection
    pub async fn new(
        license_manager: Arc<LicenseManager>,
        security_manager: Arc<SecurityManager>,
        forensic_logger: Arc<ForensicLogger>,
        metrics_registry: Arc<MetricsRegistry>,
        database_manager: Arc<DatabaseManager>,
        config: EnterpriseConfig,
    ) -> Result<Self, EnterpriseError> {
        let current_license = license_manager.get_current_license().await;
        
        // Check if enterprise features are available with current license
        let feature_status = Self::check_feature_availability(&current_license.tier);
        
        let mut manager = Self {
            plugin_system: None,
            compliance_dashboard: None,
            multi_tenant_system: None,
            api_gateway: None,
            license_manager,
            features_status: Arc::new(RwLock::new(feature_status)),
        };
        
        // Initialize enterprise features based on license and configuration
        manager.initialize_features(
            config,
            security_manager,
            forensic_logger,
            metrics_registry,
            database_manager,
        ).await?;
        
        Ok(manager)
    }
    
    /// Initialize enterprise features based on license and configuration
    async fn initialize_features(
        &mut self,
        config: EnterpriseConfig,
        security_manager: Arc<SecurityManager>,
        forensic_logger: Arc<ForensicLogger>,
        metrics_registry: Arc<MetricsRegistry>,
        database_manager: Arc<DatabaseManager>,
    ) -> Result<(), EnterpriseError> {
        let current_license = self.license_manager.get_current_license().await;
        
        // Initialize plugin system
        if config.enable_plugin_system && self.is_feature_available("plugin_system").await {
            match EnterprisePluginSystem::new(
                security_manager.clone(),
                self.license_manager.clone(),
                forensic_logger.clone(),
            ).await {
                Ok(plugin_system) => {
                    self.plugin_system = Some(Arc::new(plugin_system));
                    tracing::info!("Enterprise plugin system initialized");
                },
                Err(e) => {
                    tracing::warn!("Failed to initialize plugin system: {}", e);
                }
            }
        }
        
        // Initialize compliance dashboard
        if config.enable_compliance_dashboard && self.is_feature_available("compliance_dashboard").await {
            match ComplianceDashboard::new(
                forensic_logger.clone(),
                security_manager.clone(),
                self.license_manager.clone(),
                database_manager.clone(),
            ).await {
                Ok(compliance_dashboard) => {
                    self.compliance_dashboard = Some(Arc::new(compliance_dashboard));
                    tracing::info!("Enterprise compliance dashboard initialized");
                },
                Err(e) => {
                    tracing::warn!("Failed to initialize compliance dashboard: {}", e);
                }
            }
        }
        
        // Initialize multi-tenant system
        if config.enable_multi_tenant && self.is_feature_available("multi_tenant").await {
            match MultiTenantSystem::new(
                security_manager.clone(),
                self.license_manager.clone(),
                forensic_logger.clone(),
                metrics_registry.clone(),
                database_manager.clone(),
            ).await {
                Ok(multi_tenant_system) => {
                    self.multi_tenant_system = Some(Arc::new(multi_tenant_system));
                    tracing::info!("Enterprise multi-tenant system initialized");
                },
                Err(e) => {
                    tracing::warn!("Failed to initialize multi-tenant system: {}", e);
                }
            }
        }
        
        // Initialize API gateway
        if config.enable_api_gateway && self.is_feature_available("api_gateway").await {
            if let Some(multi_tenant_system) = &self.multi_tenant_system {
                match EnterpriseAPIGateway::new(
                    security_manager.clone(),
                    self.license_manager.clone(),
                    forensic_logger.clone(),
                    metrics_registry.clone(),
                    multi_tenant_system.clone(),
                ).await {
                    Ok(api_gateway) => {
                        self.api_gateway = Some(Arc::new(api_gateway));
                        tracing::info!("Enterprise API gateway initialized");
                    },
                    Err(e) => {
                        tracing::warn!("Failed to initialize API gateway: {}", e);
                    }
                }
            }
        }
        
        Ok(())
    }
    
    /// Check if a specific enterprise feature is available
    pub async fn is_feature_available(&self, feature_name: &str) -> bool {
        let status = self.features_status.read().await;
        
        match feature_name {
            "plugin_system" => status.plugin_system_available,
            "compliance_dashboard" => status.compliance_dashboard_available,
            "multi_tenant" => status.multi_tenant_available,
            "api_gateway" => status.api_gateway_available,
            _ => false,
        }
    }
    
    /// Get enterprise plugin system (if available)
    pub fn get_plugin_system(&self) -> Option<Arc<EnterprisePluginSystem>> {
        self.plugin_system.clone()
    }
    
    /// Get compliance dashboard (if available)
    pub fn get_compliance_dashboard(&self) -> Option<Arc<ComplianceDashboard>> {
        self.compliance_dashboard.clone()
    }
    
    /// Get multi-tenant system (if available)
    pub fn get_multi_tenant_system(&self) -> Option<Arc<MultiTenantSystem>> {
        self.multi_tenant_system.clone()
    }
    
    /// Get API gateway (if available)
    pub fn get_api_gateway(&self) -> Option<Arc<EnterpriseAPIGateway>> {
        self.api_gateway.clone()
    }
    
    /// Get current enterprise feature status
    pub async fn get_feature_status(&self) -> EnterpriseFeatureStatus {
        self.features_status.read().await.clone()
    }
    
    /// Refresh enterprise feature availability (call when license changes)
    pub async fn refresh_feature_availability(&self) -> Result<(), EnterpriseError> {
        let current_license = self.license_manager.get_current_license().await;
        let new_status = Self::check_feature_availability(&current_license.tier);
        
        *self.features_status.write().await = new_status;
        
        tracing::info!(
            license_tier = ?current_license.tier,
            "Enterprise feature availability refreshed"
        );
        
        Ok(())
    }
    
    /// Check feature availability based on license tier
    fn check_feature_availability(license_tier: &LicenseTier) -> EnterpriseFeatureStatus {
        match license_tier {
            LicenseTier::Community => EnterpriseFeatureStatus {
                license_tier: license_tier.clone(),
                plugin_system_available: false,
                compliance_dashboard_available: false,
                multi_tenant_available: false,
                api_gateway_available: false,
                last_checked: chrono::Utc::now(),
            },
            LicenseTier::Enterprise => EnterpriseFeatureStatus {
                license_tier: license_tier.clone(),
                plugin_system_available: true,
                compliance_dashboard_available: true,
                multi_tenant_available: true,
                api_gateway_available: true,
                last_checked: chrono::Utc::now(),
            },
            LicenseTier::Defense => EnterpriseFeatureStatus {
                license_tier: license_tier.clone(),
                plugin_system_available: true,
                compliance_dashboard_available: true,
                multi_tenant_available: true,
                api_gateway_available: true,
                last_checked: chrono::Utc::now(),
            },
        }
    }
    
    /// Get enterprise summary for dashboard
    pub async fn get_enterprise_summary(&self) -> EnterpriseSummary {
        let feature_status = self.get_feature_status().await;
        
        let mut active_features = Vec::new();
        if self.plugin_system.is_some() {
            active_features.push("Plugin System".to_string());
        }
        if self.compliance_dashboard.is_some() {
            active_features.push("Compliance Dashboard".to_string());
        }
        if self.multi_tenant_system.is_some() {
            active_features.push("Multi-Tenant System".to_string());
        }
        if self.api_gateway.is_some() {
            active_features.push("API Gateway".to_string());
        }
        
        EnterpriseSummary {
            license_tier: feature_status.license_tier,
            active_features,
            total_available_features: self.count_available_features(&feature_status),
            enterprise_enabled: !matches!(feature_status.license_tier, LicenseTier::Community),
            last_updated: chrono::Utc::now(),
        }
    }
    
    fn count_available_features(&self, status: &EnterpriseFeatureStatus) -> u32 {
        let mut count = 0;
        if status.plugin_system_available { count += 1; }
        if status.compliance_dashboard_available { count += 1; }
        if status.multi_tenant_available { count += 1; }
        if status.api_gateway_available { count += 1; }
        count
    }
}

/// Enterprise summary for dashboard display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnterpriseSummary {
    pub license_tier: LicenseTier,
    pub active_features: Vec<String>,
    pub total_available_features: u32,
    pub enterprise_enabled: bool,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

/// Enterprise feature registry for dynamic feature discovery
#[derive(Debug)]
pub struct EnterpriseFeatureRegistry {
    features: HashMap<String, FeatureDefinition>,
}

/// Feature definition for registry
#[derive(Debug, Clone)]
pub struct FeatureDefinition {
    pub feature_id: String,
    pub feature_name: String,
    pub description: String,
    pub required_license: LicenseTier,
    pub dependencies: Vec<String>,
    pub enabled: bool,
}

impl EnterpriseFeatureRegistry {
    /// Create new feature registry with standard enterprise features
    pub fn new() -> Self {
        let mut features = HashMap::new();
        
        // Plugin System
        features.insert("plugin_system".to_string(), FeatureDefinition {
            feature_id: "plugin_system".to_string(),
            feature_name: "Enterprise Plugin System".to_string(),
            description: "Signed plugin loading with cryptographic verification".to_string(),
            required_license: LicenseTier::Enterprise,
            dependencies: vec!["security_manager".to_string()],
            enabled: true,
        });
        
        // Compliance Dashboard
        features.insert("compliance_dashboard".to_string(), FeatureDefinition {
            feature_id: "compliance_dashboard".to_string(),
            feature_name: "Compliance Dashboard".to_string(),
            description: "SOX/HIPAA/GDPR automatic compliance reporting".to_string(),
            required_license: LicenseTier::Enterprise,
            dependencies: vec!["forensic_logger".to_string(), "database_manager".to_string()],
            enabled: true,
        });
        
        // Multi-Tenant System
        features.insert("multi_tenant".to_string(), FeatureDefinition {
            feature_id: "multi_tenant".to_string(),
            feature_name: "Multi-Tenant System".to_string(),
            description: "Scalable SaaS tenant isolation and management".to_string(),
            required_license: LicenseTier::Enterprise,
            dependencies: vec!["security_manager".to_string(), "database_manager".to_string()],
            enabled: true,
        });
        
        // API Gateway
        features.insert("api_gateway".to_string(), FeatureDefinition {
            feature_id: "api_gateway".to_string(),
            feature_name: "Enterprise API Gateway".to_string(),
            description: "Advanced API management, routing, and security".to_string(),
            required_license: LicenseTier::Enterprise,
            dependencies: vec!["multi_tenant".to_string(), "security_manager".to_string()],
            enabled: true,
        });
        
        Self { features }
    }
    
    /// Get feature definition by ID
    pub fn get_feature(&self, feature_id: &str) -> Option<&FeatureDefinition> {
        self.features.get(feature_id)
    }
    
    /// List all features for a license tier
    pub fn list_features_for_license(&self, license_tier: &LicenseTier) -> Vec<&FeatureDefinition> {
        self.features
            .values()
            .filter(|feature| {
                match (&feature.required_license, license_tier) {
                    (LicenseTier::Community, _) => true,
                    (LicenseTier::Enterprise, LicenseTier::Enterprise | LicenseTier::Defense) => true,
                    (LicenseTier::Defense, LicenseTier::Defense) => true,
                    _ => false,
                }
            })
            .collect()
    }
    
    /// Check if feature dependencies are satisfied
    pub fn check_dependencies(&self, feature_id: &str, available_features: &[String]) -> bool {
        if let Some(feature) = self.features.get(feature_id) {
            for dependency in &feature.dependencies {
                if !available_features.contains(dependency) {
                    return false;
                }
            }
        }
        true
    }
}

impl Default for EnterpriseFeatureRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_feature_availability_community() {
        let status = EnterpriseManager::check_feature_availability(&LicenseTier::Community);
        
        assert!(!status.plugin_system_available);
        assert!(!status.compliance_dashboard_available);
        assert!(!status.multi_tenant_available);
        assert!(!status.api_gateway_available);
    }
    
    #[test]
    fn test_feature_availability_enterprise() {
        let status = EnterpriseManager::check_feature_availability(&LicenseTier::Enterprise);
        
        assert!(status.plugin_system_available);
        assert!(status.compliance_dashboard_available);
        assert!(status.multi_tenant_available);
        assert!(status.api_gateway_available);
    }
    
    #[test]
    fn test_feature_registry() {
        let registry = EnterpriseFeatureRegistry::new();
        
        assert!(registry.get_feature("plugin_system").is_some());
        assert!(registry.get_feature("compliance_dashboard").is_some());
        assert!(registry.get_feature("multi_tenant").is_some());
        assert!(registry.get_feature("api_gateway").is_some());
        
        let enterprise_features = registry.list_features_for_license(&LicenseTier::Enterprise);
        assert_eq!(enterprise_features.len(), 4);
        
        let community_features = registry.list_features_for_license(&LicenseTier::Community);
        assert_eq!(community_features.len(), 0);
    }
    
    #[test]
    fn test_enterprise_summary_serialization() {
        let summary = EnterpriseSummary {
            license_tier: LicenseTier::Enterprise,
            active_features: vec!["Plugin System".to_string(), "Multi-Tenant".to_string()],
            total_available_features: 4,
            enterprise_enabled: true,
            last_updated: chrono::Utc::now(),
        };
        
        let json = serde_json::to_string(&summary).unwrap();
        let parsed: EnterpriseSummary = serde_json::from_str(&json).unwrap();
        
        assert_eq!(summary.active_features.len(), parsed.active_features.len());
        assert_eq!(summary.enterprise_enabled, parsed.enterprise_enabled);
    }
}
