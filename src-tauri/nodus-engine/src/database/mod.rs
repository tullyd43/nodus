// `src/database/mod.rs` - directory module to expose database-related files
pub mod database_mod;
pub mod db_optimization_analyzer;

// Re-export the primary items so callers can use `crate::database::DatabaseManager`.
pub use database_mod::*;
pub use db_optimization_analyzer::*;
