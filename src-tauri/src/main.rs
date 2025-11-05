// src-tauri/src/main.rs
// Nodus Security Platform - Tauri Entry Point
// Replaces: SystemBootstrap.js + ServiceRegistry.js

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, State};
use std::sync::Arc;
use tokio::sync::RwLock;

mod security;
mod observability; 
mod database;
mod commands;
mod state;
mod license;

use security::{SecurityManager, MACEngine, ClassificationCrypto};
use observability::{ForensicLogger, MetricsRegistry, ActionDispatcher};
use database::DatabaseManager;
use state::AppState;
use license::LicenseManager;

type AppStateType = Arc<RwLock<AppState>>;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing for observability (replaces your JS observability)
    tracing_subscriber::fmt::init();
    
    tracing::info!("🦀 Starting Nodus Security Platform v8.0.0");

    // Initialize core security services (replaces ServiceRegistry pattern)
    let app_state = initialize_security_core().await?;

    // Build Tauri app with security-first architecture
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Security Commands (replace SecurityManager.js methods)
            commands::security::set_user_context,
            commands::security::clear_user_context,
            commands::security::mac_decision,
            commands::security::get_auth_token,
            
            // Data Commands (replace HybridStateManager.js methods)
            commands::data::load_entity,
            commands::data::save_entity,
            commands::data::query_entities,
            commands::data::validate_entity,
            
            // Observability Commands (replace ForensicLogger.js + MetricsRegistry.js)
            commands::observability::get_metrics,
            commands::observability::get_audit_trail,
            commands::observability::export_forensic_log,
            
            // Policy Commands (replace TenantPolicyService.js)
            commands::policy::get_policy,
            commands::policy::set_policy,
            commands::policy::evaluate_policy,
            
            // License Commands (replace license validation)
            commands::license::check_feature,
            commands::license::get_license_info,
        ])
        .setup(|app| {
            // Post-initialization setup
            tracing::info!("🔐 Security core initialized successfully");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

/// Initialize the security core (replaces your ServiceRegistry initialization)
async fn initialize_security_core() -> Result<AppStateType, Box<dyn std::error::Error>> {
    // License validation first (defense-grade security)
    let license_manager = LicenseManager::new().await?;
    
    // Database connection (using your existing PostgreSQL schema)
    let db_manager = DatabaseManager::new().await?;
    
    // Core security services
    let mac_engine = MACEngine::new();
    let classification_crypto = ClassificationCrypto::new().await?;
    let security_manager = SecurityManager::new(mac_engine, classification_crypto);
    
    // Observability stack
    let metrics_registry = MetricsRegistry::new();
    let forensic_logger = ForensicLogger::new(&db_manager).await?;
    let action_dispatcher = ActionDispatcher::new(forensic_logger.clone(), metrics_registry.clone());
    
    // Compose application state
    let app_state = AppState {
        security_manager,
        db_manager,
        metrics_registry,
        forensic_logger,
        action_dispatcher,
        license_manager,
        initialized: true,
    };
    
    Ok(Arc::new(RwLock::new(app_state)))
}