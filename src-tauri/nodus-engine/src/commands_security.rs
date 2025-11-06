// src-tauri/src/commands/security.rs
// Security Command Handlers - Tauri Commands for Security Operations
// Provides secure frontend access to security manager functionality

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::security::{
    SecurityManager, SecurityOperationRequest, SecurityOperationType, 
    SecurityOperationResult, ClassificationLevel, AuthenticationMethod,
    ThreatAssessmentResult, SecurityContext,
};
use crate::observability::ObservabilityContext;
use crate::state::AppState;
use crate::error::AppError;

/// Tauri command for user authentication and security context creation
#[tauri::command]
pub async fn authenticate_user(
    username: String,
    password: String,
    auth_method: String,
    source_ip: Option<String>,
    user_agent: Option<String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<AuthenticationResult, String> {
    let auth_method = parse_auth_method(&auth_method)?;
    
    // Create observability context
    let obs_context = ObservabilityContext::new(
        "security",
        "authenticate_user",
        ClassificationLevel::Internal,
        &username,
        Uuid::new_v4(),
    );

    // Authenticate user through security manager
    let security_manager = &app_state.security_manager;
    
    // TODO: Implement actual authentication logic
    // For now, mock successful authentication
    let user_context = crate::state::UserContext {
        user_id: username.clone(),
        clearance_level: ClassificationLevel::Internal,
        compartments: vec!["default".to_string()],
        permissions: vec!["read".to_string(), "write".to_string()],
        tenant_id: None,
        session_metadata: HashMap::new(),
    };

    let session_id = Uuid::new_v4();
    
    let security_context = security_manager.create_security_context(
        &user_context,
        session_id,
        auth_method,
        source_ip,
        user_agent,
    ).await.map_err(|e| e.to_string())?;

    Ok(AuthenticationResult {
        success: true,
        session_id: session_id.to_string(),
        user_id: username,
        clearance_level: security_context.security_label.level.to_string(),
        compartments: security_context.compartment_access,
        permissions: security_context.permissions,
        expires_at: chrono::Utc::now() + chrono::Duration::hours(8),
    })
}

/// Tauri command for security access checks
#[tauri::command]
pub async fn check_security_access(
    session_id: String,
    resource: String,
    action: String,
    classification: String,
    context: HashMap<String, String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<SecurityCheckResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    let classification_level = parse_classification(&classification)?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "security",
        "check_access",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Create security operation request
    let request = SecurityOperationRequest {
        operation_type: SecurityOperationType::AccessCheck,
        user_id: security_context.user_id.clone(),
        session_id: session_uuid,
        resource: resource.clone(),
        action: action.clone(),
        context: context.clone(),
        classification: classification_level,
    };

    // Perform security check
    let result = app_state.security_manager.security_check(
        request,
        &obs_context,
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    Ok(SecurityCheckResult {
        allowed: result.allowed,
        risk_score: result.risk_score,
        reasons: result.policy_decisions.iter()
            .map(|d| format!("{}: {}", d.policy_id, d.reason))
            .collect(),
        restrictions: result.additional_restrictions.unwrap_or_default(),
        audit_required: result.audit_required,
    })
}

/// Tauri command for encrypting data
#[tauri::command]
pub async fn encrypt_data(
    session_id: String,
    data: Vec<u8>,
    classification: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<EncryptionResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    let classification_level = parse_classification(&classification)?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "security",
        "encrypt_data",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Encrypt data with security manager
    let encrypted_data = app_state.security_manager.encrypt_data(
        &data,
        classification_level,
        &security_context,
        &obs_context,
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    Ok(EncryptionResult {
        encrypted_data: encrypted_data.ciphertext,
        nonce: encrypted_data.nonce,
        domain_id: encrypted_data.domain_id.to_string(),
        algorithm: format!("{:?}", encrypted_data.algorithm),
        metadata: EncryptionMetadataResult {
            operation_id: encrypted_data.metadata.operation_id.to_string(),
            encrypted_at: encrypted_data.encrypted_at,
            key_version: encrypted_data.metadata.key_version,
            compliance_tags: encrypted_data.metadata.compliance_tags,
        },
    })
}

/// Tauri command for decrypting data
#[tauri::command]
pub async fn decrypt_data(
    session_id: String,
    encrypted_data: EncryptedDataInput,
    app_state: tauri::State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Parse encrypted data
    let domain_id = Uuid::parse_str(&encrypted_data.domain_id)
        .map_err(|_| "Invalid domain ID format")?;
    
    let classification_level = parse_classification(&encrypted_data.classification)?;
    let algorithm = parse_encryption_algorithm(&encrypted_data.algorithm)?;

    // Create observability context
    let obs_context = ObservabilityContext::new(
        "security",
        "decrypt_data",
        classification_level.clone(),
        &security_context.user_id,
        session_uuid,
    );

    // Reconstruct encrypted data structure
    let encrypted = crate::security::classification_crypto::EncryptedData {
        ciphertext: encrypted_data.ciphertext,
        nonce: encrypted_data.nonce,
        classification: classification_level,
        domain_id,
        aad_hash: encrypted_data.aad_hash,
        algorithm,
        encrypted_at: encrypted_data.encrypted_at,
        metadata: crate::security::classification_crypto::EncryptionMetadata {
            operation_id: Uuid::parse_str(&encrypted_data.operation_id)
                .map_err(|_| "Invalid operation ID")?,
            user_id: security_context.user_id.clone(),
            session_id: session_uuid,
            key_version: encrypted_data.key_version,
            domain_version: 1,
            compliance_tags: encrypted_data.compliance_tags,
        },
    };

    // Decrypt data with security manager
    let decrypted_data = app_state.security_manager.decrypt_data(
        &encrypted,
        &security_context,
        &obs_context,
        &app_state,
    ).await.map_err(|e| e.to_string())?;

    Ok(decrypted_data)
}

/// Tauri command for threat assessment
#[tauri::command]
pub async fn assess_threat(
    session_id: String,
    activity_description: String,
    metadata: HashMap<String, String>,
    app_state: tauri::State<'_, AppState>,
) -> Result<ThreatAssessmentResponse, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Get security context
    let security_context = app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Perform threat assessment
    let assessment = app_state.security_manager.threat_assessment(
        &security_context,
        &activity_description,
        metadata,
    ).await.map_err(|e| e.to_string())?;

    Ok(ThreatAssessmentResponse {
        risk_score: assessment.risk_score,
        threat_level: format!("{:?}", assessment.threat_level),
        auto_response: assessment.auto_response.map(|r| format!("{:?}", r)),
        recommended_actions: assessment.recommended_actions,
    })
}

/// Tauri command for getting security metrics
#[tauri::command]
pub async fn get_security_metrics(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<SecurityMetricsResult, String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    // Verify session exists (basic authorization)
    app_state.security_manager
        .get_security_context(session_uuid).await
        .ok_or("Invalid or expired session")?;

    // Get security metrics
    let metrics = app_state.security_manager.get_security_metrics().await;

    Ok(SecurityMetricsResult {
        total_security_checks: metrics.total_security_checks,
        access_granted: metrics.access_granted,
        access_denied: metrics.access_denied,
        encryption_operations: metrics.encryption_operations,
        decryption_operations: metrics.decryption_operations,
        active_sessions: metrics.active_sessions,
        threats_detected: metrics.threats_detected,
        threats_mitigated: metrics.threats_mitigated,
        policy_violations: metrics.policy_violations,
        avg_risk_score: metrics.avg_risk_score,
    })
}

/// Tauri command for updating security context
#[tauri::command]
pub async fn update_security_context(
    session_id: String,
    activity: String,
    risk_modifier: f64,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    app_state.security_manager.update_security_context(
        session_uuid,
        &activity,
        risk_modifier,
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// Tauri command for terminating security session
#[tauri::command]
pub async fn terminate_session(
    session_id: String,
    app_state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let session_uuid = Uuid::parse_str(&session_id)
        .map_err(|_| "Invalid session ID format")?;
    
    app_state.security_manager.terminate_security_context(session_uuid)
        .await.map_err(|e| e.to_string())?;

    Ok(())
}

// Helper functions

fn parse_auth_method(method: &str) -> Result<AuthenticationMethod, String> {
    match method.to_lowercase().as_str() {
        "password" => Ok(AuthenticationMethod::Password),
        "two_factor" | "2fa" => Ok(AuthenticationMethod::TwoFactor),
        "certificate" => Ok(AuthenticationMethod::Certificate),
        "biometric" => Ok(AuthenticationMethod::Biometric),
        "smart_card" => Ok(AuthenticationMethod::SmartCard),
        "saml" => Ok(AuthenticationMethod::SAML),
        "oauth2" => Ok(AuthenticationMethod::OAuth2),
        _ => Err(format!("Unsupported authentication method: {}", method)),
    }
}

fn parse_classification(classification: &str) -> Result<ClassificationLevel, String> {
    match classification.to_uppercase().as_str() {
        "UNCLASSIFIED" => Ok(ClassificationLevel::Unclassified),
        "INTERNAL" => Ok(ClassificationLevel::Internal),
        "CONFIDENTIAL" => Ok(ClassificationLevel::Confidential),
        "SECRET" => Ok(ClassificationLevel::Secret),
        "NATO_SECRET" => Ok(ClassificationLevel::NatoSecret),
        _ => Err(format!("Invalid classification level: {}", classification)),
    }
}

fn parse_encryption_algorithm(algorithm: &str) -> Result<crate::security::classification_crypto::EncryptionAlgorithm, String> {
    use crate::security::classification_crypto::EncryptionAlgorithm;
    
    match algorithm {
        "AES256GCM" => Ok(EncryptionAlgorithm::AES256GCM),
        "ChaCha20Poly1305" => Ok(EncryptionAlgorithm::ChaCha20Poly1305),
        "AES256CCM" => Ok(EncryptionAlgorithm::AES256CCM),
        _ => Err(format!("Unsupported encryption algorithm: {}", algorithm)),
    }
}

// Response types for Tauri commands

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthenticationResult {
    pub success: bool,
    pub session_id: String,
    pub user_id: String,
    pub clearance_level: String,
    pub compartments: Vec<String>,
    pub permissions: Vec<String>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecurityCheckResult {
    pub allowed: bool,
    pub risk_score: f64,
    pub reasons: Vec<String>,
    pub restrictions: Vec<String>,
    pub audit_required: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptionResult {
    pub encrypted_data: Vec<u8>,
    pub nonce: Vec<u8>,
    pub domain_id: String,
    pub algorithm: String,
    pub metadata: EncryptionMetadataResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptionMetadataResult {
    pub operation_id: String,
    pub encrypted_at: chrono::DateTime<chrono::Utc>,
    pub key_version: u32,
    pub compliance_tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptedDataInput {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub classification: String,
    pub domain_id: String,
    pub aad_hash: Option<Vec<u8>>,
    pub algorithm: String,
    pub encrypted_at: chrono::DateTime<chrono::Utc>,
    pub operation_id: String,
    pub key_version: u32,
    pub compliance_tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ThreatAssessmentResponse {
    pub risk_score: f64,
    pub threat_level: String,
    pub auto_response: Option<String>,
    pub recommended_actions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SecurityMetricsResult {
    pub total_security_checks: u64,
    pub access_granted: u64,
    pub access_denied: u64,
    pub encryption_operations: u64,
    pub decryption_operations: u64,
    pub active_sessions: u32,
    pub threats_detected: u32,
    pub threats_mitigated: u32,
    pub policy_violations: u32,
    pub avg_risk_score: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_classification() {
        assert!(matches!(
            parse_classification("CONFIDENTIAL"),
            Ok(ClassificationLevel::Confidential)
        ));
        
        assert!(parse_classification("INVALID").is_err());
    }

    #[test]
    fn test_parse_auth_method() {
        assert!(matches!(
            parse_auth_method("password"),
            Ok(AuthenticationMethod::Password)
        ));
        
        assert!(matches!(
            parse_auth_method("2fa"),
            Ok(AuthenticationMethod::TwoFactor)
        ));
        
        assert!(parse_auth_method("invalid").is_err());
    }

    #[test]
    fn test_parse_encryption_algorithm() {
        assert!(matches!(
            parse_encryption_algorithm("AES256GCM"),
            Ok(crate::security::classification_crypto::EncryptionAlgorithm::AES256GCM)
        ));
        
        assert!(parse_encryption_algorithm("INVALID").is_err());
    }
}
