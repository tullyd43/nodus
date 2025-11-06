// src-tauri/src/commands/license.rs
// Licensing Command Handlers - Tauri Commands for License Validation and Feature Access
// Provides secure frontend access to three-tier licensing system

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::license::{LicenseManager, LicenseTier, LicenseInfo, FeatureDefinition};
use crate::security::{ClassificationLevel, SecurityContext};
use crate::observability::ObservabilityContext;
use crate::state::AppState;
use crate::error::AppError;

/// Tauri command for getting current license information
#[tauri::command]
pub async fn get_license_info(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<LicenseInfoResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "license",
        "get_license_info",
        ClassificationLevel::Internal,
        &security_context.user_id,
        session_uuid,
    );

    // Get license information
    let license_info = app_state.license_manager.get_license_info().await;
    let current_tier = app_state.license_manager.get_tier().await;

    Ok(LicenseInfoResult {
        license_id: license_info.license_id,
        customer_name: license_info.customer_name,
        tier: format!("{:?}", current_tier),
        issued_at: license_info.issued_at,
        expires_at: license_info.expires_at,
        max_users: license_info.max_users,
        max_nodes: license_info.max_nodes,
        allowed_deployments: license_info.allowed_deployments,
        is_valid: app_state.license_manager.is_valid().await,
        days_until_expiry: (license_info.expires_at - chrono::Utc::now()).num_days(),
        issuer: license_info.issuer,
        signature_valid: true, // TODO: Implement signature validation
    })
}

/// Tauri command for checking if a feature is available
#[tauri::command]
pub async fn check_feature_availability(
    session_id: String,
    feature_name: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<FeatureAvailabilityResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check feature availability
    let is_available = app_state.license_manager.has_feature(&feature_name).await;
    let current_tier = app_state.license_manager.get_tier().await;

    // Get feature definition if available
    let feature_definition = app_state.license_manager.get_feature_definition(&feature_name).await;

    Ok(FeatureAvailabilityResult {
        feature_name: feature_name.clone(),
        is_available,
        current_tier: format!("{:?}", current_tier),
        required_tier: feature_definition
            .as_ref()
            .map(|def| format!("{:?}", def.required_tier))
            .unwrap_or_else(|| "Unknown".to_string()),
        description: feature_definition
            .as_ref()
            .map(|def| def.description.clone())
            .unwrap_or_else(|| "Feature definition not found".to_string()),
        usage_limits: feature_definition
            .as_ref()
            .and_then(|def| def.usage_limits.clone()),
        enforcement_level: feature_definition
            .as_ref()
            .map(|def| format!("{:?}", def.enforcement_level))
            .unwrap_or_else(|| "Unknown".to_string()),
    })
}

/// Tauri command for getting all available features for current license
#[tauri::command]
pub async fn get_available_features(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<AvailableFeaturesResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get current tier and all features
    let current_tier = app_state.license_manager.get_tier().await;
    let all_features = app_state.license_manager.get_all_features().await;

    let mut available_features = Vec::new();
    let mut unavailable_features = Vec::new();

    for (feature_name, feature_def) in all_features {
        let is_available = app_state.license_manager.has_feature(&feature_name).await;
        
        let feature_info = FeatureInfo {
            name: feature_name.clone(),
            description: feature_def.description,
            required_tier: format!("{:?}", feature_def.required_tier),
            category: feature_def.category,
            usage_limits: feature_def.usage_limits,
            enforcement_level: format!("{:?}", feature_def.enforcement_level),
        };

        if is_available {
            available_features.push(feature_info);
        } else {
            unavailable_features.push(feature_info);
        }
    }

    Ok(AvailableFeaturesResult {
        current_tier: format!("{:?}", current_tier),
        available_features,
        unavailable_features,
        total_features: available_features.len() + unavailable_features.len(),
    })
}

/// Tauri command for validating license (admin only)
#[tauri::command]
pub async fn validate_license(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<LicenseValidationResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check if user has admin permissions
    if !security_context.permissions.contains(&"license_admin".to_string()) {
        return Err("Insufficient permissions for license validation".to_string());
    }

    // Perform full license validation
    let validation_result = app_state.license_manager.validate_license().await;

    match validation_result {
        Ok(validation_info) => Ok(LicenseValidationResult {
            is_valid: true,
            validation_time: chrono::Utc::now(),
            signature_valid: validation_info.signature_valid,
            not_expired: validation_info.not_expired,
            customer_match: validation_info.customer_match,
            hardware_match: validation_info.hardware_match,
            deployment_valid: validation_info.deployment_valid,
            validation_errors: Vec::new(),
            next_validation: chrono::Utc::now() + chrono::Duration::hours(24),
        }),
        Err(errors) => Ok(LicenseValidationResult {
            is_valid: false,
            validation_time: chrono::Utc::now(),
            signature_valid: false,
            not_expired: false,
            customer_match: false,
            hardware_match: false,
            deployment_valid: false,
            validation_errors: errors.into_iter().map(|e| e.to_string()).collect(),
            next_validation: chrono::Utc::now() + chrono::Duration::hours(1), // More frequent validation for invalid licenses
        }),
    }
}

/// Tauri command for getting license usage statistics
#[tauri::command]
pub async fn get_license_usage(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<LicenseUsageResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check if user has admin permissions
    if !security_context.permissions.contains(&"license_admin".to_string()) {
        return Err("Insufficient permissions for license usage data".to_string());
    }

    // Get license usage statistics
    let usage_stats = app_state.license_manager.get_usage_statistics().await;
    let license_info = app_state.license_manager.get_license_info().await;

    // Get current active sessions for user count
    let active_sessions = app_state.security_manager.get_active_sessions().await;
    let unique_users: std::collections::HashSet<String> = active_sessions
        .into_iter()
        .map(|session| session.user_id)
        .collect();

    // Calculate usage percentages
    let user_usage_percent = if license_info.max_users > 0 {
        (unique_users.len() as f64 / license_info.max_users as f64) * 100.0
    } else {
        0.0
    };

    let node_usage_percent = if license_info.max_nodes > 0 {
        (usage_stats.active_nodes as f64 / license_info.max_nodes as f64) * 100.0
    } else {
        0.0
    };

    Ok(LicenseUsageResult {
        current_users: unique_users.len() as u32,
        max_users: license_info.max_users,
        user_usage_percent,
        current_nodes: usage_stats.active_nodes,
        max_nodes: license_info.max_nodes,
        node_usage_percent,
        current_deployments: usage_stats.active_deployments,
        max_deployments: license_info.allowed_deployments.len() as u32,
        feature_usage: usage_stats.feature_usage,
        last_updated: chrono::Utc::now(),
    })
}

/// Tauri command for checking license compliance
#[tauri::command]
pub async fn check_license_compliance(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<LicenseComplianceResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check if user has admin permissions
    if !security_context.permissions.contains(&"license_admin".to_string()) {
        return Err("Insufficient permissions for license compliance check".to_string());
    }

    // Perform compliance check
    let compliance_result = app_state.license_manager.check_compliance().await;

    let mut compliance_issues = Vec::new();
    let mut compliance_warnings = Vec::new();

    // Check various compliance aspects
    let license_info = app_state.license_manager.get_license_info().await;
    let usage_stats = app_state.license_manager.get_usage_statistics().await;

    // Check user limit compliance
    if usage_stats.current_users > license_info.max_users {
        compliance_issues.push(ComplianceIssue {
            issue_type: "user_limit_exceeded".to_string(),
            severity: "critical".to_string(),
            description: format!(
                "Current users ({}) exceeds license limit ({})",
                usage_stats.current_users, license_info.max_users
            ),
            recommendation: "Upgrade license or reduce user count".to_string(),
        });
    } else if usage_stats.current_users as f64 / license_info.max_users as f64 > 0.9 {
        compliance_warnings.push(ComplianceIssue {
            issue_type: "user_limit_warning".to_string(),
            severity: "warning".to_string(),
            description: format!(
                "User count ({}) is approaching license limit ({})",
                usage_stats.current_users, license_info.max_users
            ),
            recommendation: "Consider upgrading license".to_string(),
        });
    }

    // Check node limit compliance
    if usage_stats.active_nodes > license_info.max_nodes {
        compliance_issues.push(ComplianceIssue {
            issue_type: "node_limit_exceeded".to_string(),
            severity: "critical".to_string(),
            description: format!(
                "Active nodes ({}) exceeds license limit ({})",
                usage_stats.active_nodes, license_info.max_nodes
            ),
            recommendation: "Upgrade license or reduce node count".to_string(),
        });
    }

    // Check expiration
    let days_until_expiry = (license_info.expires_at - chrono::Utc::now()).num_days();
    if days_until_expiry <= 0 {
        compliance_issues.push(ComplianceIssue {
            issue_type: "license_expired".to_string(),
            severity: "critical".to_string(),
            description: "License has expired".to_string(),
            recommendation: "Renew license immediately".to_string(),
        });
    } else if days_until_expiry <= 30 {
        compliance_warnings.push(ComplianceIssue {
            issue_type: "license_expiring".to_string(),
            severity: "warning".to_string(),
            description: format!("License expires in {} days", days_until_expiry),
            recommendation: "Plan for license renewal".to_string(),
        });
    }

    let is_compliant = compliance_issues.is_empty();
    let compliance_score = if is_compliant {
        if compliance_warnings.is_empty() { 100.0 } else { 85.0 }
    } else {
        50.0 - (compliance_issues.len() as f64 * 10.0)
    };

    Ok(LicenseComplianceResult {
        is_compliant,
        compliance_score: compliance_score.max(0.0),
        compliance_status: if is_compliant {
            if compliance_warnings.is_empty() { "compliant" } else { "compliant_with_warnings" }
        } else {
            "non_compliant"
        }.to_string(),
        compliance_issues,
        compliance_warnings,
        last_check: chrono::Utc::now(),
        next_check: chrono::Utc::now() + chrono::Duration::hours(24),
    })
}

/// Tauri command for updating license (admin only)
#[tauri::command]
pub async fn update_license(
    session_id: String,
    license_data: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<LicenseUpdateResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Check if user has admin permissions
    if !security_context.permissions.contains(&"license_admin".to_string()) {
        return Err("Insufficient permissions for license update".to_string());
    }

    // Log license update attempt
    app_state.forensic_logger.log_system_event(
        "license.update.attempt",
        &format!("License update attempted by user {}", security_context.user_id),
        &security_context.user_id,
    ).await.map_err(|e| e.to_string())?;

    // Update license
    let update_result = app_state.license_manager.update_license(&license_data).await;

    match update_result {
        Ok(new_license_info) => {
            // Log successful update
            app_state.forensic_logger.log_system_event(
                "license.update.success",
                &format!("License successfully updated to {} tier", format!("{:?}", new_license_info.tier)),
                &security_context.user_id,
            ).await.map_err(|e| e.to_string())?;

            Ok(LicenseUpdateResult {
                success: true,
                updated_at: chrono::Utc::now(),
                new_tier: format!("{:?}", new_license_info.tier),
                new_expiry: new_license_info.expires_at,
                validation_errors: Vec::new(),
                restart_required: false, // License updates take effect immediately
            })
        },
        Err(errors) => {
            // Log failed update
            app_state.forensic_logger.log_system_event(
                "license.update.failure",
                &format!("License update failed: {:?}", errors),
                &security_context.user_id,
            ).await.map_err(|e| e.to_string())?;

            Ok(LicenseUpdateResult {
                success: false,
                updated_at: chrono::Utc::now(),
                new_tier: "Unknown".to_string(),
                new_expiry: chrono::Utc::now(),
                validation_errors: errors.into_iter().map(|e| e.to_string()).collect(),
                restart_required: false,
            })
        }
    }
}

/// Tauri command for getting license tier comparison
#[tauri::command]
pub async fn get_tier_comparison(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<TierComparisonResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get current tier
    let current_tier = app_state.license_manager.get_tier().await;

    // Get tier definitions
    let tier_definitions = app_state.license_manager.get_tier_definitions().await;

    let mut tiers = Vec::new();
    for (tier, definition) in tier_definitions {
        tiers.push(TierInfo {
            tier: format!("{:?}", tier),
            is_current: tier == current_tier,
            name: definition.name,
            description: definition.description,
            max_users: definition.max_users,
            max_nodes: definition.max_nodes,
            included_features: definition.included_features,
            price_tier: definition.price_tier,
            support_level: definition.support_level,
        });
    }

    // Sort tiers by hierarchy (Community -> Enterprise -> Defense)
    tiers.sort_by_key(|tier| match tier.tier.as_str() {
        "Community" => 0,
        "Enterprise" => 1,
        "Defense" => 2,
        _ => 3,
    });

    Ok(TierComparisonResult {
        current_tier: format!("{:?}", current_tier),
        available_tiers: tiers,
        upgrade_recommendations: get_upgrade_recommendations(&current_tier),
    })
}

// Helper functions

fn get_upgrade_recommendations(current_tier: &LicenseTier) -> Vec<String> {
    match current_tier {
        LicenseTier::Community => vec![
            "Upgrade to Enterprise for advanced security features".to_string(),
            "Get professional support and SLA guarantees".to_string(),
            "Access enterprise compliance features".to_string(),
        ],
        LicenseTier::Enterprise => vec![
            "Upgrade to Defense for maximum security classification support".to_string(),
            "Access NATO SECRET classification handling".to_string(),
            "Get defense-grade audit trails and compliance".to_string(),
        ],
        LicenseTier::Defense => vec![
            "You have the highest tier available".to_string(),
        ],
    }
}

// Request/Response types for Tauri commands

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseInfoResult {
    pub license_id: String,
    pub customer_name: String,
    pub tier: String,
    pub issued_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub max_users: u32,
    pub max_nodes: u32,
    pub allowed_deployments: Vec<String>,
    pub is_valid: bool,
    pub days_until_expiry: i64,
    pub issuer: String,
    pub signature_valid: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeatureAvailabilityResult {
    pub feature_name: String,
    pub is_available: bool,
    pub current_tier: String,
    pub required_tier: String,
    pub description: String,
    pub usage_limits: Option<HashMap<String, u32>>,
    pub enforcement_level: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AvailableFeaturesResult {
    pub current_tier: String,
    pub available_features: Vec<FeatureInfo>,
    pub unavailable_features: Vec<FeatureInfo>,
    pub total_features: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeatureInfo {
    pub name: String,
    pub description: String,
    pub required_tier: String,
    pub category: String,
    pub usage_limits: Option<HashMap<String, u32>>,
    pub enforcement_level: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseValidationResult {
    pub is_valid: bool,
    pub validation_time: chrono::DateTime<chrono::Utc>,
    pub signature_valid: bool,
    pub not_expired: bool,
    pub customer_match: bool,
    pub hardware_match: bool,
    pub deployment_valid: bool,
    pub validation_errors: Vec<String>,
    pub next_validation: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseUsageResult {
    pub current_users: u32,
    pub max_users: u32,
    pub user_usage_percent: f64,
    pub current_nodes: u32,
    pub max_nodes: u32,
    pub node_usage_percent: f64,
    pub current_deployments: u32,
    pub max_deployments: u32,
    pub feature_usage: HashMap<String, u32>,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseComplianceResult {
    pub is_compliant: bool,
    pub compliance_score: f64,
    pub compliance_status: String,
    pub compliance_issues: Vec<ComplianceIssue>,
    pub compliance_warnings: Vec<ComplianceIssue>,
    pub last_check: chrono::DateTime<chrono::Utc>,
    pub next_check: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ComplianceIssue {
    pub issue_type: String,
    pub severity: String,
    pub description: String,
    pub recommendation: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseUpdateResult {
    pub success: bool,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub new_tier: String,
    pub new_expiry: chrono::DateTime<chrono::Utc>,
    pub validation_errors: Vec<String>,
    pub restart_required: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TierComparisonResult {
    pub current_tier: String,
    pub available_tiers: Vec<TierInfo>,
    pub upgrade_recommendations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TierInfo {
    pub tier: String,
    pub is_current: bool,
    pub name: String,
    pub description: String,
    pub max_users: u32,
    pub max_nodes: u32,
    pub included_features: Vec<String>,
    pub price_tier: String,
    pub support_level: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_upgrade_recommendations() {
        let community_recs = get_upgrade_recommendations(&LicenseTier::Community);
        assert!(!community_recs.is_empty());
        assert!(community_recs[0].contains("Enterprise"));

        let defense_recs = get_upgrade_recommendations(&LicenseTier::Defense);
        assert_eq!(defense_recs.len(), 1);
        assert!(defense_recs[0].contains("highest tier"));
    }

    #[test]
    fn test_license_info_result_serialization() {
        let result = LicenseInfoResult {
            license_id: "test-license".to_string(),
            customer_name: "Test Customer".to_string(),
            tier: "Enterprise".to_string(),
            issued_at: chrono::Utc::now(),
            expires_at: chrono::Utc::now() + chrono::Duration::days(365),
            max_users: 100,
            max_nodes: 10,
            allowed_deployments: vec!["production".to_string()],
            is_valid: true,
            days_until_expiry: 365,
            issuer: "Nodus Security".to_string(),
            signature_valid: true,
        };
        
        let serialized = serde_json::to_string(&result).unwrap();
        let deserialized: LicenseInfoResult = serde_json::from_str(&serialized).unwrap();
        
        assert_eq!(result.license_id, deserialized.license_id);
        assert_eq!(result.max_users, deserialized.max_users);
    }

    #[test]
    fn test_compliance_issue_creation() {
        let issue = ComplianceIssue {
            issue_type: "user_limit_exceeded".to_string(),
            severity: "critical".to_string(),
            description: "Too many users".to_string(),
            recommendation: "Upgrade license".to_string(),
        };
        
        assert_eq!(issue.severity, "critical");
        assert!(issue.description.contains("users"));
    }
}
