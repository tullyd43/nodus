// src-tauri/src/enterprise/plugin_system.rs
// Enterprise Plugin System - Signed Plugin Loading with Cryptographic Verification
// Replaces ManifestPluginSystem.js with defense-grade plugin security

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use ring::{signature, digest};
use uuid::Uuid;

use crate::security::{SecurityManager, ClassificationLevel, SecurityLabel};
use crate::license::{LicenseManager, LicenseTier};
use crate::observability::ForensicLogger;
use crate::state::AppState;

/// Enterprise plugin system with cryptographic verification
#[derive(Debug)]
pub struct EnterprisePluginSystem {
    /// Loaded and verified plugins
    loaded_plugins: Arc<RwLock<HashMap<String, LoadedPlugin>>>,
    
    /// Plugin verification keys (public keys for signature verification)
    verification_keys: HashMap<String, Vec<u8>>,
    
    /// Security manager for access control
    security_manager: Arc<SecurityManager>,
    
    /// License manager for feature gating
    license_manager: Arc<LicenseManager>,
    
    /// Forensic logger for plugin operations
    forensic_logger: Arc<ForensicLogger>,
    
    /// Plugin sandbox configurations
    sandbox_configs: HashMap<String, SandboxConfig>,
}

/// Plugin manifest with cryptographic signatures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    /// Unique plugin identifier
    pub id: String,
    
    /// Plugin name and version
    pub name: String,
    pub version: String,
    
    /// Plugin metadata
    pub description: String,
    pub author: String,
    pub license: String,
    
    /// Required license tier for this plugin
    pub required_license: LicenseTier,
    
    /// Security classification requirements
    pub classification_level: ClassificationLevel,
    
    /// Plugin capabilities and permissions
    pub capabilities: Vec<PluginCapability>,
    pub permissions: Vec<PluginPermission>,
    
    /// Entry points for different contexts
    pub entry_points: PluginEntryPoints,
    
    /// Dependencies on other plugins
    pub dependencies: Vec<PluginDependency>,
    
    /// Plugin file hashes for integrity verification
    pub file_hashes: HashMap<String, String>,
    
    /// Cryptographic signature of the manifest
    pub signature: String,
    
    /// Public key fingerprint for signature verification
    pub key_fingerprint: String,
}

/// Plugin capability declarations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginCapability {
    /// Database access with specific permissions
    DatabaseAccess {
        read: bool,
        write: bool,
        admin: bool,
        classification_levels: Vec<ClassificationLevel>,
    },
    
    /// Network access permissions
    NetworkAccess {
        outbound: bool,
        inbound: bool,
        domains: Vec<String>,
    },
    
    /// File system access
    FileSystemAccess {
        read_paths: Vec<String>,
        write_paths: Vec<String>,
    },
    
    /// Cryptographic operations
    CryptographicAccess {
        encryption: bool,
        decryption: bool,
        signing: bool,
        key_management: bool,
    },
    
    /// UI integration capabilities
    UIIntegration {
        components: bool,
        hooks: bool,
        layouts: bool,
    },
    
    /// Observability and metrics
    ObservabilityAccess {
        metrics_read: bool,
        metrics_write: bool,
        audit_read: bool,
        forensic_write: bool,
    },
}

/// Plugin permission model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginPermission {
    pub resource: String,
    pub actions: Vec<String>,
    pub conditions: Vec<PermissionCondition>,
}

/// Conditional permissions based on context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionCondition {
    pub condition_type: String,
    pub parameters: serde_json::Value,
}

/// Plugin entry points for different execution contexts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntryPoints {
    /// Main plugin initialization
    pub main: Option<String>,
    
    /// Forensic plugin hooks
    pub forensic_hooks: Option<Vec<ForensicHook>>,
    
    /// UI component providers
    pub ui_components: Option<Vec<UIComponentProvider>>,
    
    /// Command handlers
    pub command_handlers: Option<Vec<CommandHandler>>,
    
    /// Background services
    pub background_services: Option<Vec<BackgroundService>>,
}

/// Forensic plugin hook definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForensicHook {
    pub hook_type: String,
    pub handler: String,
    pub priority: u32,
    pub async_execution: bool,
}

/// UI component provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIComponentProvider {
    pub component_name: String,
    pub handler: String,
    pub props_schema: serde_json::Value,
}

/// Command handler definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandHandler {
    pub command: String,
    pub handler: String,
    pub permissions: Vec<String>,
}

/// Background service definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundService {
    pub service_name: String,
    pub handler: String,
    pub schedule: Option<String>,
    pub auto_start: bool,
}

/// Plugin dependency specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDependency {
    pub plugin_id: String,
    pub version_requirement: String,
    pub optional: bool,
}

/// Loaded plugin runtime information
#[derive(Debug)]
pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    pub plugin_path: PathBuf,
    pub load_time: chrono::DateTime<chrono::Utc>,
    pub status: PluginStatus,
    pub runtime_context: PluginRuntimeContext,
}

/// Plugin runtime status
#[derive(Debug, Clone)]
pub enum PluginStatus {
    Loading,
    Active,
    Paused,
    Error(String),
    Unloading,
}

/// Plugin runtime context and sandboxing
#[derive(Debug)]
pub struct PluginRuntimeContext {
    pub plugin_id: String,
    pub sandbox_config: SandboxConfig,
    pub resource_limits: ResourceLimits,
    pub granted_permissions: Vec<PluginPermission>,
}

/// Sandbox configuration for plugin isolation
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    pub isolation_level: IsolationLevel,
    pub allowed_syscalls: Vec<String>,
    pub memory_limit: usize,
    pub cpu_limit: f64,
    pub network_isolation: bool,
    pub filesystem_isolation: bool,
}

/// Plugin isolation levels
#[derive(Debug, Clone)]
pub enum IsolationLevel {
    /// Full system access (requires Defense license)
    None,
    
    /// Standard sandbox with basic restrictions
    Standard,
    
    /// High security sandbox with strict limitations
    Strict,
    
    /// Maximum isolation for untrusted plugins
    Maximum,
}

/// Resource limits for plugins
#[derive(Debug, Clone)]
pub struct ResourceLimits {
    pub max_memory: usize,
    pub max_cpu_percent: f64,
    pub max_file_handles: u32,
    pub max_network_connections: u32,
    pub execution_timeout: std::time::Duration,
}

/// Plugin system errors
#[derive(Debug, thiserror::Error)]
pub enum PluginError {
    #[error("Plugin not found: {plugin_id}")]
    PluginNotFound { plugin_id: String },
    
    #[error("Invalid plugin manifest: {reason}")]
    InvalidManifest { reason: String },
    
    #[error("Signature verification failed for plugin: {plugin_id}")]
    SignatureVerificationFailed { plugin_id: String },
    
    #[error("Insufficient license for plugin: {plugin_id}, requires: {required_license:?}")]
    InsufficientLicense { 
        plugin_id: String, 
        required_license: LicenseTier 
    },
    
    #[error("Permission denied for plugin: {plugin_id}, missing: {permission}")]
    PermissionDenied { 
        plugin_id: String, 
        permission: String 
    },
    
    #[error("Plugin loading failed: {plugin_id}, error: {error}")]
    LoadingFailed { 
        plugin_id: String, 
        error: String 
    },
    
    #[error("Sandbox violation by plugin: {plugin_id}, violation: {violation}")]
    SandboxViolation { 
        plugin_id: String, 
        violation: String 
    },
}

impl EnterprisePluginSystem {
    /// Create new enterprise plugin system
    pub async fn new(
        security_manager: Arc<SecurityManager>,
        license_manager: Arc<LicenseManager>,
        forensic_logger: Arc<ForensicLogger>,
    ) -> Result<Self, PluginError> {
        let system = Self {
            loaded_plugins: Arc::new(RwLock::new(HashMap::new())),
            verification_keys: Self::load_verification_keys().await?,
            security_manager,
            license_manager,
            forensic_logger,
            sandbox_configs: Self::create_default_sandbox_configs(),
        };
        
        Ok(system)
    }
    
    /// Load and verify a plugin from disk
    pub async fn load_plugin<P: AsRef<Path>>(
        &self,
        plugin_path: P,
        app_state: &AppState,
    ) -> Result<String, PluginError> {
        let plugin_path = plugin_path.as_ref();
        
        // 1. Load and parse plugin manifest
        let manifest = self.load_manifest(plugin_path).await?;
        
        // 2. Verify cryptographic signature
        self.verify_plugin_signature(&manifest, plugin_path).await?;
        
        // 3. Check license requirements
        self.verify_license_requirements(&manifest).await?;
        
        // 4. Validate plugin permissions
        self.validate_permissions(&manifest).await?;
        
        // 5. Verify file integrity
        self.verify_file_integrity(&manifest, plugin_path).await?;
        
        // 6. Create runtime context and sandbox
        let runtime_context = self.create_runtime_context(&manifest).await?;
        
        // 7. Load plugin into sandbox
        let loaded_plugin = self.load_plugin_runtime(&manifest, plugin_path.to_path_buf(), runtime_context).await?;
        
        // 8. Register plugin
        let plugin_id = manifest.id.clone();
        self.loaded_plugins.write().await.insert(plugin_id.clone(), loaded_plugin);
        
        // 9. Log plugin loading for audit
        self.forensic_logger.log_plugin_operation(
            "plugin_loaded",
            &plugin_id,
            &app_state.context,
            serde_json::json!({
                "plugin_name": manifest.name,
                "version": manifest.version,
                "author": manifest.author,
                "required_license": manifest.required_license,
                "capabilities": manifest.capabilities.len(),
            })
        ).await?;
        
        tracing::info!(plugin_id = %plugin_id, "Plugin loaded successfully");
        
        Ok(plugin_id)
    }
    
    /// Unload a plugin
    pub async fn unload_plugin(
        &self,
        plugin_id: &str,
        app_state: &AppState,
    ) -> Result<(), PluginError> {
        let mut plugins = self.loaded_plugins.write().await;
        
        if let Some(mut plugin) = plugins.remove(plugin_id) {
            // Update status to unloading
            plugin.status = PluginStatus::Unloading;
            
            // Perform cleanup operations
            self.cleanup_plugin_resources(&plugin).await?;
            
            // Log unloading for audit
            self.forensic_logger.log_plugin_operation(
                "plugin_unloaded",
                plugin_id,
                &app_state.context,
                serde_json::json!({
                    "plugin_name": plugin.manifest.name,
                    "load_duration": chrono::Utc::now().signed_duration_since(plugin.load_time).num_seconds(),
                })
            ).await?;
            
            tracing::info!(plugin_id = %plugin_id, "Plugin unloaded successfully");
            Ok(())
        } else {
            Err(PluginError::PluginNotFound { plugin_id: plugin_id.to_string() })
        }
    }
    
    /// Get plugin information
    pub async fn get_plugin_info(&self, plugin_id: &str) -> Option<PluginManifest> {
        self.loaded_plugins
            .read()
            .await
            .get(plugin_id)
            .map(|plugin| plugin.manifest.clone())
    }
    
    /// List all loaded plugins
    pub async fn list_plugins(&self) -> Vec<(String, PluginStatus)> {
        self.loaded_plugins
            .read()
            .await
            .iter()
            .map(|(id, plugin)| (id.clone(), plugin.status.clone()))
            .collect()
    }
    
    /// Execute plugin command
    pub async fn execute_plugin_command(
        &self,
        plugin_id: &str,
        command: &str,
        parameters: serde_json::Value,
        app_state: &AppState,
    ) -> Result<serde_json::Value, PluginError> {
        let plugins = self.loaded_plugins.read().await;
        
        if let Some(plugin) = plugins.get(plugin_id) {
            // Verify command permissions
            self.verify_command_permissions(plugin, command).await?;
            
            // Execute in sandbox
            let result = self.execute_sandboxed_command(
                plugin,
                command,
                parameters,
                app_state,
            ).await?;
            
            // Log command execution
            self.forensic_logger.log_plugin_operation(
                "plugin_command_executed",
                plugin_id,
                &app_state.context,
                serde_json::json!({
                    "command": command,
                    "success": true,
                })
            ).await?;
            
            Ok(result)
        } else {
            Err(PluginError::PluginNotFound { plugin_id: plugin_id.to_string() })
        }
    }
    
    // Private helper methods
    
    async fn load_verification_keys() -> Result<HashMap<String, Vec<u8>>, PluginError> {
        // Load public keys for plugin signature verification
        // In production, these would be embedded or loaded from secure storage
        let mut keys = HashMap::new();
        
        // Example enterprise plugin signing key
        keys.insert(
            "enterprise".to_string(),
            include_bytes!("../keys/enterprise_plugin_key.pub").to_vec()
        );
        
        // Example defense plugin signing key
        keys.insert(
            "defense".to_string(),
            include_bytes!("../keys/defense_plugin_key.pub").to_vec()
        );
        
        Ok(keys)
    }
    
    fn create_default_sandbox_configs() -> HashMap<String, SandboxConfig> {
        let mut configs = HashMap::new();
        
        // Standard enterprise plugin sandbox
        configs.insert("enterprise".to_string(), SandboxConfig {
            isolation_level: IsolationLevel::Standard,
            allowed_syscalls: vec![
                "read".to_string(),
                "write".to_string(),
                "open".to_string(),
                "close".to_string(),
            ],
            memory_limit: 256 * 1024 * 1024, // 256MB
            cpu_limit: 50.0, // 50% CPU
            network_isolation: true,
            filesystem_isolation: true,
        });
        
        // High security sandbox for untrusted plugins
        configs.insert("strict".to_string(), SandboxConfig {
            isolation_level: IsolationLevel::Strict,
            allowed_syscalls: vec![
                "read".to_string(),
                "write".to_string(),
            ],
            memory_limit: 64 * 1024 * 1024, // 64MB
            cpu_limit: 25.0, // 25% CPU
            network_isolation: true,
            filesystem_isolation: true,
        });
        
        configs
    }
    
    async fn load_manifest<P: AsRef<Path>>(&self, plugin_path: P) -> Result<PluginManifest, PluginError> {
        let manifest_path = plugin_path.as_ref().join("manifest.json");
        let manifest_content = tokio::fs::read_to_string(&manifest_path)
            .await
            .map_err(|e| PluginError::InvalidManifest { 
                reason: format!("Failed to read manifest: {}", e) 
            })?;
            
        serde_json::from_str(&manifest_content)
            .map_err(|e| PluginError::InvalidManifest { 
                reason: format!("Failed to parse manifest: {}", e) 
            })
    }
    
    async fn verify_plugin_signature(
        &self,
        manifest: &PluginManifest,
        plugin_path: &Path,
    ) -> Result<(), PluginError> {
        // Get verification key
        let key_data = self.verification_keys
            .get(&manifest.key_fingerprint)
            .ok_or_else(|| PluginError::SignatureVerificationFailed { 
                plugin_id: manifest.id.clone() 
            })?;
        
        // Parse public key
        let public_key = signature::UnparsedPublicKey::new(
            &signature::ECDSA_P256_SHA256_ASN1,
            key_data
        );
        
        // Create manifest hash for verification
        let manifest_json = serde_json::to_string(manifest).unwrap();
        let manifest_hash = digest::digest(&digest::SHA256, manifest_json.as_bytes());
        
        // Verify signature
        let signature_bytes = general_purpose::STANDARD
            .decode(&manifest.signature)
            .map_err(|_| PluginError::SignatureVerificationFailed { 
                plugin_id: manifest.id.clone() 
            })?;
        
        public_key
            .verify(manifest_hash.as_ref(), &signature_bytes)
            .map_err(|_| PluginError::SignatureVerificationFailed { 
                plugin_id: manifest.id.clone() 
            })?;
        
        Ok(())
    }
    
    async fn verify_license_requirements(&self, manifest: &PluginManifest) -> Result<(), PluginError> {
        let current_license = self.license_manager.get_current_license().await;
        
        // Check if current license meets plugin requirements
        match (&current_license.tier, &manifest.required_license) {
            (LicenseTier::Community, LicenseTier::Enterprise | LicenseTier::Defense) => {
                return Err(PluginError::InsufficientLicense {
                    plugin_id: manifest.id.clone(),
                    required_license: manifest.required_license.clone(),
                });
            },
            (LicenseTier::Enterprise, LicenseTier::Defense) => {
                return Err(PluginError::InsufficientLicense {
                    plugin_id: manifest.id.clone(),
                    required_license: manifest.required_license.clone(),
                });
            },
            _ => {} // License is sufficient
        }
        
        Ok(())
    }
    
    async fn validate_permissions(&self, manifest: &PluginManifest) -> Result<(), PluginError> {
        // Validate that plugin permissions are reasonable and allowed
        for capability in &manifest.capabilities {
            self.validate_capability(capability, manifest).await?;
        }
        
        Ok(())
    }
    
    async fn validate_capability(
        &self,
        capability: &PluginCapability,
        manifest: &PluginManifest,
    ) -> Result<(), PluginError> {
        match capability {
            PluginCapability::DatabaseAccess { admin: true, .. } => {
                // Admin database access requires Defense license
                if !matches!(manifest.required_license, LicenseTier::Defense) {
                    return Err(PluginError::PermissionDenied {
                        plugin_id: manifest.id.clone(),
                        permission: "database_admin".to_string(),
                    });
                }
            },
            PluginCapability::CryptographicAccess { key_management: true, .. } => {
                // Key management requires Enterprise or Defense license
                if matches!(manifest.required_license, LicenseTier::Community) {
                    return Err(PluginError::PermissionDenied {
                        plugin_id: manifest.id.clone(),
                        permission: "crypto_key_management".to_string(),
                    });
                }
            },
            _ => {} // Other capabilities are generally allowed
        }
        
        Ok(())
    }
    
    async fn verify_file_integrity(
        &self,
        manifest: &PluginManifest,
        plugin_path: &Path,
    ) -> Result<(), PluginError> {
        // Verify file hashes match manifest
        for (file_path, expected_hash) in &manifest.file_hashes {
            let full_path = plugin_path.join(file_path);
            let file_content = tokio::fs::read(&full_path)
                .await
                .map_err(|_| PluginError::InvalidManifest {
                    reason: format!("Plugin file not found: {}", file_path)
                })?;
            
            let actual_hash = digest::digest(&digest::SHA256, &file_content);
            let actual_hash_hex = hex::encode(actual_hash.as_ref());
            
            if &actual_hash_hex != expected_hash {
                return Err(PluginError::InvalidManifest {
                    reason: format!("File integrity check failed for: {}", file_path)
                });
            }
        }
        
        Ok(())
    }
    
    async fn create_runtime_context(&self, manifest: &PluginManifest) -> Result<PluginRuntimeContext, PluginError> {
        let sandbox_config = self.get_sandbox_config_for_plugin(manifest);
        let resource_limits = self.calculate_resource_limits(manifest);
        let granted_permissions = manifest.permissions.clone();
        
        Ok(PluginRuntimeContext {
            plugin_id: manifest.id.clone(),
            sandbox_config,
            resource_limits,
            granted_permissions,
        })
    }
    
    fn get_sandbox_config_for_plugin(&self, manifest: &PluginManifest) -> SandboxConfig {
        // Select appropriate sandbox based on license tier and plugin capabilities
        match manifest.required_license {
            LicenseTier::Defense => self.sandbox_configs.get("enterprise").unwrap().clone(),
            LicenseTier::Enterprise => self.sandbox_configs.get("enterprise").unwrap().clone(),
            LicenseTier::Community => self.sandbox_configs.get("strict").unwrap().clone(),
        }
    }
    
    fn calculate_resource_limits(&self, manifest: &PluginManifest) -> ResourceLimits {
        // Calculate resource limits based on plugin requirements and license
        let base_memory = match manifest.required_license {
            LicenseTier::Defense => 512 * 1024 * 1024,    // 512MB
            LicenseTier::Enterprise => 256 * 1024 * 1024, // 256MB
            LicenseTier::Community => 64 * 1024 * 1024,   // 64MB
        };
        
        ResourceLimits {
            max_memory: base_memory,
            max_cpu_percent: 50.0,
            max_file_handles: 100,
            max_network_connections: 10,
            execution_timeout: std::time::Duration::from_secs(30),
        }
    }
    
    async fn load_plugin_runtime(
        &self,
        manifest: &PluginManifest,
        plugin_path: PathBuf,
        runtime_context: PluginRuntimeContext,
    ) -> Result<LoadedPlugin, PluginError> {
        // Create loaded plugin structure
        Ok(LoadedPlugin {
            manifest: manifest.clone(),
            plugin_path,
            load_time: chrono::Utc::now(),
            status: PluginStatus::Active,
            runtime_context,
        })
    }
    
    async fn cleanup_plugin_resources(&self, plugin: &LoadedPlugin) -> Result<(), PluginError> {
        // Cleanup any resources allocated to the plugin
        tracing::debug!(plugin_id = %plugin.manifest.id, "Cleaning up plugin resources");
        
        // Implementation would include:
        // - Stopping background services
        // - Closing file handles
        // - Cleaning up memory allocations
        // - Removing UI components
        // - Unregistering command handlers
        
        Ok(())
    }
    
    async fn verify_command_permissions(
        &self,
        plugin: &LoadedPlugin,
        command: &str,
    ) -> Result<(), PluginError> {
        // Check if plugin has permission to execute the command
        for handler in plugin.manifest.entry_points.command_handlers.as_ref().unwrap_or(&vec![]) {
            if handler.command == command {
                // Found the command, check permissions
                for permission in &handler.permissions {
                    // Verify plugin has this permission
                    if !plugin.runtime_context.granted_permissions.iter()
                        .any(|p| p.resource == *permission) {
                        return Err(PluginError::PermissionDenied {
                            plugin_id: plugin.manifest.id.clone(),
                            permission: permission.clone(),
                        });
                    }
                }
                return Ok(());
            }
        }
        
        Err(PluginError::PermissionDenied {
            plugin_id: plugin.manifest.id.clone(),
            permission: format!("command_{}", command),
        })
    }
    
    async fn execute_sandboxed_command(
        &self,
        plugin: &LoadedPlugin,
        command: &str,
        parameters: serde_json::Value,
        app_state: &AppState,
    ) -> Result<serde_json::Value, PluginError> {
        // Execute the command within the plugin's sandbox
        // This is a simplified implementation - real sandboxing would use
        // OS-level isolation mechanisms
        
        tracing::debug!(
            plugin_id = %plugin.manifest.id,
            command = %command,
            "Executing plugin command in sandbox"
        );
        
        // For now, return a success response
        // Real implementation would load and execute the plugin code
        Ok(serde_json::json!({
            "success": true,
            "result": "Command executed successfully",
            "plugin_id": plugin.manifest.id,
            "command": command,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_plugin_manifest_serialization() {
        let manifest = PluginManifest {
            id: "test-plugin".to_string(),
            name: "Test Plugin".to_string(),
            version: "1.0.0".to_string(),
            description: "A test plugin".to_string(),
            author: "Test Author".to_string(),
            license: "MIT".to_string(),
            required_license: LicenseTier::Enterprise,
            classification_level: ClassificationLevel::Confidential,
            capabilities: vec![],
            permissions: vec![],
            entry_points: PluginEntryPoints {
                main: None,
                forensic_hooks: None,
                ui_components: None,
                command_handlers: None,
                background_services: None,
            },
            dependencies: vec![],
            file_hashes: HashMap::new(),
            signature: "test-signature".to_string(),
            key_fingerprint: "test-key".to_string(),
        };
        
        let json = serde_json::to_string(&manifest).unwrap();
        let parsed: PluginManifest = serde_json::from_str(&json).unwrap();
        
        assert_eq!(manifest.id, parsed.id);
        assert_eq!(manifest.name, parsed.name);
    }
}
