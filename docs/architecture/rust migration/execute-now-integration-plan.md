# ⚡ EXECUTE NOW: v8.0.0-Beta Integration Sprint

## 🎯 **START HERE - Immediate Actions**

You have everything you need. Let's integrate the 4 enhanced files and begin hardening **right now**.

---

## 📋 **Phase 1: Core Integration (Next 30 minutes)**

### **Step 1: Backup & Prepare (5 minutes)**
```bash
# Create backup directory
mkdir -p backup_$(date +%Y%m%d_%H%M%S)

# Backup existing files (if they exist)
cp src/main.rs backup_*/main.rs 2>/dev/null || true
cp src/policy/policy_snapshot.rs backup_*/policy_snapshot.rs 2>/dev/null || true
cp src/commands/dispatch.rs backup_*/dispatch.rs 2>/dev/null || true

# Create missing directories
mkdir -p src/policy
mkdir -p src/observability
mkdir -p src/commands
```

### **Step 2: Copy Enhanced Files (5 minutes)**
```bash
# Copy the 4 enhanced core files
cp enhanced-policy-snapshot.rs src/policy/policy_snapshot.rs
cp enhanced-policy-layer.rs src/observability/policy_layer.rs
cp zero-overhead-instrument.rs src/observability/instrument.rs
cp enhanced-dispatch.rs src/commands/dispatch.rs
```

### **Step 3: Update Cargo.toml (10 minutes)**
```toml
# Add these dependencies to your existing Cargo.toml:

[dependencies]
# Enhanced core dependencies
arc-swap = "1.7"
constant_time_eq = "0.3"
sha2 = "0.10"
hex = "0.4"
color-eyre = "0.6"

# Update tauri features (remove api-all, add minimal)
tauri = { version = "1.4", features = [
    "shell-open",
    "system-tray", 
    "window-all",
    "dialog-all"
] }

# Add 4-tier license features
[features]
default = ["open_source"]
open_source = ["core_ui", "basic_storage", "local_policies"]
pro = ["open_source", "advanced_storage", "browser_integration"]
enterprise = ["pro", "multi_tenant", "compliance", "plugins"]
defense = ["enterprise", "classification_crypto", "cds", "post_quantum"]

# Individual features (map to your existing modules)
core_ui = []
basic_storage = []
advanced_storage = []
multi_tenant = []
classification_crypto = []
plugins = ["plugins_wasm"]
post_quantum = ["experimental"]
```

### **Step 4: Update License Tiers (10 minutes)**
```rust
// Edit src/license/license_mod.rs - Update your LicenseTier enum:

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum LicenseTier {
    OpenSource = 0,
    Pro = 1,
    Enterprise = 2,
    Defense = 3,
}

impl LicenseTier {
    pub fn get_features(&self) -> Vec<&'static str> {
        match self {
            Self::OpenSource => vec!["core_ui", "basic_storage", "local_policies"],
            Self::Pro => vec!["advanced_storage", "browser_integration", "offline_sync"],
            Self::Enterprise => vec!["multi_tenant", "compliance", "plugins", "ai_embeddings"],
            Self::Defense => vec!["classification_crypto", "cds", "post_quantum", "temporal_forensics"],
        }
    }
}
```

---

## 📋 **Phase 2: Integration Testing (Next 20 minutes)**

### **Step 5: Test Compilation (5 minutes)**
```bash
# Test basic compilation
cargo check

# If errors, fix import paths:
# Common fixes needed:
# - Add "use crate::policy::policy_snapshot::current_policy;" to security_manager.rs
# - Add "use crate::observability::instrument::instrument;" to command files
```

### **Step 6: Update Security Manager (5 minutes)**
```rust
// Edit src/security/security_manager.rs - Add at the top:
use crate::policy::policy_snapshot::current_policy;
use crate::observability::instrument::instrument;

// Find your authorize method and add policy check:
pub async fn authorize(&self, ctx: &Context, command: &str) -> Result<(), SecurityError> {
    let policy = current_policy();
    
    if !policy.sec.command_allowed(command) {
        return Err(SecurityError::CommandNotAllowed);
    }
    
    // Your existing logic stays the same
    Ok(())
}
```

### **Step 7: Update Commands (10 minutes)**
```rust
// For each commands_*.rs file, remove #[tauri::command] and update signature:

// OLD:
// #[tauri::command]
// pub async fn read_entity(id: String, state: tauri::State<AppState>) -> Result<Value, String>

// NEW:
pub async fn read_entity(payload: Value, ctx: &Context, app_state: &AppState) -> Result<Value, Box<dyn std::error::Error>> {
    use crate::observability::instrument::instrument;
    
    instrument("data_read", || async {
        let id = payload["id"].as_str().unwrap_or("");
        // Your existing logic
        Ok(serde_json::json!({"result": "success"}))
    }).await
}
```

---

## 📋 **Phase 3: Immediate Hardening (Next 60 minutes)**

### **Step 8: Security Validation (20 minutes)**
```bash
# Test single front-door (only dispatch should be exposed)
grep -r "#\[tauri::command\]" src/ | grep -v dispatch.rs
# Should return nothing except dispatch.rs

# Test rate limiting
cargo test test_rate_limiter_basic

# Test policy validation
cargo test test_policy_validation
```

### **Step 9: Performance Testing (20 minutes)**
```bash
# Test zero-overhead observability
# 1. Set observability.enabled = false in policy
echo '[observability]
enabled = false
[security]
mac_enforcement = true
[plugins]
wasm_enabled = false
[database]
advisor_mode = true' > nodus_system_policy.toml

# 2. Run performance test
cargo run --release
# Measure startup time and memory usage

# 3. Enable observability and compare
sed -i 's/enabled = false/enabled = true/' nodus_system_policy.toml
cargo run --release
# Should be minimal difference
```

### **Step 10: Integration Smoke Test (20 minutes)**
```bash
# Start the application
cargo run

# In another terminal, test dispatch:
curl -X POST "http://localhost:1420/api/invoke" \
  -H "Content-Type: application/json" \
  -d '{
    "cmd": "dispatch",
    "command": "system.status",
    "payload": {},
    "ctx": {
      "tenant_id": "test-tenant",
      "session_id": "test-session",
      "actor": "test-user"
    }
  }'

# Should return system status without errors
```

---

## 📋 **Phase 4: Critical Security Hardening (Next 90 minutes)**

### **Step 11: Input Validation Hardening (30 minutes)**
```rust
// Enhance your Context validation in dispatch.rs:
impl Context {
    pub fn validate(&self) -> Result<(), DispatchError> {
        // Existing validation...
        
        // Add security hardening:
        if self.tenant_id.contains("../") || self.tenant_id.contains("..\\") {
            return Err(DispatchError::BadRequest("Invalid tenant_id".into()));
        }
        
        if self.session_id.len() < 16 || self.session_id.len() > 128 {
            return Err(DispatchError::BadRequest("Invalid session_id length".into()));
        }
        
        // Add SQL injection protection
        if self.actor.contains("'") || self.actor.contains("\"") || self.actor.contains(";") {
            return Err(DispatchError::BadRequest("Invalid actor format".into()));
        }
        
        Ok(())
    }
}
```

### **Step 12: Timing Attack Hardening (30 minutes)**
```rust
// Verify constant-time operations in security_manager.rs:
use constant_time_eq::constant_time_eq;

impl SecurityManager {
    pub fn compare_secrets(&self, a: &[u8], b: &[u8]) -> bool {
        constant_time_eq(a, b)
    }
    
    pub async fn authenticate(&self, provided: &str, expected_hash: &str) -> bool {
        // Use constant-time comparison for authentication
        let provided_hash = self.hash_credential(provided).await;
        constant_time_eq(provided_hash.as_bytes(), expected_hash.as_bytes())
    }
}
```

### **Step 13: Memory Safety Validation (30 minutes)**
```bash
# Run with address sanitizer
export RUSTFLAGS="-Z sanitizer=address"
cargo run --target x86_64-unknown-linux-gnu

# Check for memory leaks under load
cargo test --release test_memory_usage_under_load

# Validate no unwrap/panic in production code
grep -r "unwrap()" src/ | grep -v test
grep -r "panic!" src/ | grep -v test
# Should return minimal results, all in non-critical paths
```

---

## 📋 **Phase 5: Performance Hardening (Next 60 minutes)**

### **Step 14: Lock Contention Elimination (20 minutes)**
```bash
# Test policy reads under load
cargo test test_policy_concurrent_reads

# Verify zero lock contention on hot paths
cargo test test_dispatch_concurrency

# Benchmark policy access
cargo bench bench_policy_access
```

### **Step 15: Memory Optimization (20 minutes)**
```bash
# Profile memory usage
cargo run --release --features=profiling

# Test bounded data structures
cargo test test_rate_limiter_cleanup
cargo test test_cache_bounds

# Verify no memory leaks in long-running scenarios
cargo test test_long_running_stability
```

### **Step 16: Database Performance (20 minutes)**
```bash
# Test database connection pooling
cargo test test_database_pool_efficiency

# Verify query performance
cargo test test_database_query_performance

# Test advisor mode recommendations
cargo test test_database_advisor_mode
```

---

## 🎯 **Critical Success Checkpoints**

After each phase, verify these checkpoints:

### **Phase 1 Checkpoint:**
- ✅ Compiles without errors: `cargo check --all-features`
- ✅ Only dispatch exposed: `grep -c "#\[tauri::command\]" src/commands/dispatch.rs` returns 1

### **Phase 2 Checkpoint:**  
- ✅ Policy system active: Policy loads and hot-reload works
- ✅ Security integration: Commands require valid Context
- ✅ Basic functionality: System status command works

### **Phase 3 Checkpoint:**
- ✅ Zero-overhead verified: <1ms observability overhead when enabled
- ✅ Security gates active: Invalid commands properly rejected
- ✅ Performance acceptable: <500ms startup, <50MB memory

### **Phase 4 Checkpoint:**
- ✅ Input validation: All injection attempts blocked
- ✅ Timing safety: All crypto operations constant-time
- ✅ Memory safety: No unsafe operations in hot paths

### **Phase 5 Checkpoint:**
- ✅ Lock-free operation: Policy reads show zero contention
- ✅ Bounded resources: All caches and queues properly limited
- ✅ Database optimized: Query performance meets requirements

---

## 🚨 **If You Hit Issues**

### **Common Integration Issues:**
```bash
# Import path errors
error[E0432]: unresolved import `crate::policy::policy_snapshot`
# Fix: Check module declarations in lib.rs

# Type mismatches  
error[E0308]: mismatched types
# Fix: Update function signatures to match dispatch pattern

# Missing dependencies
error[E0433]: failed to resolve: use of undeclared crate
# Fix: Add dependencies to Cargo.toml
```

### **Quick Fixes:**
```bash
# Reset if needed
git checkout -- src/
# Start over with just the 4 enhanced files

# Check module structure
find src/ -name "mod.rs" -exec grep -l "pub mod" {} \;
# Ensure all modules properly declared
```

---

## 🎯 **End State (4-5 Hours From Now)**

You'll have:
- ✅ **Production-ready v8.0.0-beta** with 4-tier licensing
- ✅ **Defense-grade security** with complete audit trails  
- ✅ **Enterprise performance** with zero-overhead observability
- ✅ **Bulletproof architecture** ready for enterprise deployment

**Let's execute! Start with Phase 1 right now.** 🚀
