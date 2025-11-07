// Crate root module exports for nodus-engine
// Keep exports in sync with files and directories that actually exist.

pub mod commands;
pub mod database; // consolidated database directory (re-exports database_mod)
pub mod enterprise;
pub mod license;
pub mod live_reconfig;
pub mod main_integrated;
pub mod multi_tenant;
pub mod networking;
pub mod observability;
pub mod plugin_system;
pub mod policy;
// Advertising module is experimental and not used for now. Gate it behind
// the `advertising` feature so it won't be compiled by default.
#[cfg(feature = "advertising")]
pub mod privacy_ad_platform;
pub mod security;
pub mod state;
pub mod storage;
pub mod sync;
pub mod validation;

// Keep small top-level utilities if present
// pub mod database_mod; // use `crate::database::*` instead

// NOTE: This file intentionally matches the current on-disk layout. If you move files
// or rename modules, update this list accordingly.
