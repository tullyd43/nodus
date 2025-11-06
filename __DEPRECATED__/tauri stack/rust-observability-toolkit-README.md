# 🦀 **RUST OBSERVABILITY TOOLKIT** - Open Source Edition
*Advanced observability patterns for the Rust community*

[![Crates.io](https://img.shields.io/crates/v/rust-observability-toolkit)](https://crates.io/crates/rust-observability-toolkit)
[![Documentation](https://docs.rs/rust-observability-toolkit/badge.svg)](https://docs.rs/rust-observability-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.70+-blue.svg)](https://www.rust-lang.org)

## 🎯 **What is this?**

A **zero-overhead observability toolkit** that brings enterprise-grade automatic observability to any Rust project. Born from advanced enterprise systems, now **open source for everyone**.

### **🚀 Key Features**

- ✅ **Automatic observability** - never forget audit trails again
- ✅ **Zero manual logging** - observability happens automatically
- ✅ **Sub-1ms overhead** - production-ready performance
- ✅ **Policy-driven** - configure once, observe everywhere
- ✅ **Forensic-grade** - legal compliance ready
- ✅ **Pluggable exporters** - works with any backend

---

## 📦 **Quick Start**

### **Add to your Cargo.toml**
```toml
[dependencies]
rust-observability-toolkit = "0.1.0"
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
```

### **Basic Usage**
```rust
use rust_observability_toolkit::prelude::*;

#[derive(Observable)]
struct UserService {
    db: Database,
}

impl UserService {
    #[observe(operation = "user_creation", security_level = "high")]
    async fn create_user(&self, user_data: UserData) -> Result<User, UserError> {
        // Your business logic here
        let user = self.db.insert_user(user_data).await?;
        
        // Observability happens automatically:
        // - Function entry/exit logged
        // - Parameters captured (respecting privacy)
        // - Performance metrics recorded
        // - Security events tracked
        // - Compliance audit trail created
        
        Ok(user)
    }
    
    #[observe(operation = "sensitive_data_access", privacy_level = "pii")]
    async fn get_user_details(&self, user_id: UserId) -> Result<UserDetails, UserError> {
        // Automatically creates:
        // - Data access audit log
        // - Privacy compliance record
        // - Performance tracking
        // - Security monitoring
        
        self.db.get_user(user_id).await
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize observability (one line!)
    let observability = ObservabilityBuilder::new()
        .with_policy_from_file("observability_policy.toml")?
        .with_exporter(JsonFileExporter::new("audit.jsonl"))
        .with_exporter(PrometheusExporter::new("http://localhost:9090"))
        .with_forensic_mode(true)
        .build()
        .await?;
    
    // Your application runs normally
    let user_service = UserService::new(database).await?;
    let user = user_service.create_user(user_data).await?;
    
    // All observability happens automatically!
    Ok(())
}
```

---

## 🔧 **Configuration**

### **observability_policy.toml**
```toml
[global]
# Zero overhead in production
overhead_budget_ns = 1_000_000  # 1ms max overhead

[operations.user_creation]
audit_level = "full"
performance_tracking = true
security_monitoring = true
compliance_frameworks = ["SOX", "GDPR"]

[operations.sensitive_data_access]
audit_level = "forensic"
privacy_protection = "automatic_redaction"
retention_policy = "7_years"
encryption_required = true

[privacy]
# Automatic PII detection and protection
pii_auto_detection = true
pii_redaction_strategy = "hash_with_salt"
consent_tracking = true

[performance]
# Sub-1ms performance tracking
latency_percentiles = [50, 90, 95, 99]
memory_tracking = true
cpu_profiling = false  # Disable in production

[security]
# Security event detection
suspicious_pattern_detection = true
anomaly_detection = true
threat_correlation = true

[compliance]
# Automatic compliance
audit_trail_immutable = true
chain_of_custody = true
legal_hold_support = true
```

---

## 🏗️ **Architecture**

### **Core Components**

```rust
// The magic happens in these components:

pub struct ObservabilityEngine {
    policy_engine: PolicyEngine,           // What to observe
    capture_engine: CaptureEngine,         // How to capture
    export_engine: ExportEngine,           // Where to send
    privacy_engine: PrivacyEngine,         // How to protect
    performance_tracker: PerformanceTracker, // Overhead monitoring
}

// Zero-overhead capture using compile-time magic
#[derive(Observable)]
pub struct YourStruct {
    // Automatically gets observability injected
}

// Policy-driven observation
#[observe(
    operation = "critical_business_function",
    audit_level = "forensic",
    compliance = ["SOX", "HIPAA", "GDPR"],
    privacy_level = "pii"
)]
pub async fn your_function() -> Result<T, E> {
    // Your code runs normally
    // Observability is invisible and automatic
}
```

### **How It Works**

1. **Compile-time injection** - proc macros inject observability code
2. **Policy-driven** - configuration determines what to observe
3. **Zero-overhead** - optimized away in release builds when not needed
4. **Privacy-first** - automatic PII detection and protection
5. **Compliance-ready** - immutable audit trails with chain of custody

---

## 🚀 **Advanced Features**

### **Automatic Compliance**
```rust
// SOX compliance - automatic!
#[observe(compliance = ["SOX"], financial_data = true)]
async fn process_financial_transaction(txn: Transaction) -> Result<Receipt, Error> {
    // Automatically creates:
    // - Immutable audit record
    // - Chain of custody
    // - Access control logging
    // - Data integrity verification
}

// GDPR compliance - automatic!
#[observe(compliance = ["GDPR"], privacy_level = "pii")]
async fn process_user_data(data: PersonalData) -> Result<ProcessedData, Error> {
    // Automatically creates:
    // - Consent tracking
    // - Data processing record
    // - Right to erasure support
    // - Data portability logs
}
```

### **Performance Intelligence**
```rust
// Automatic performance optimization insights
#[observe(performance_optimization = true)]
async fn heavy_computation(data: LargeDataset) -> Result<ProcessedResult, Error> {
    // Toolkit automatically:
    // - Profiles execution
    // - Identifies bottlenecks
    // - Suggests optimizations
    // - Tracks improvement over time
}
```

### **Security Event Correlation**
```rust
// Automatic security monitoring
#[observe(security_monitoring = "advanced")]
async fn user_authentication(credentials: Credentials) -> Result<AuthToken, AuthError> {
    // Automatically detects:
    // - Brute force attempts
    // - Credential stuffing
    // - Anomalous access patterns
    // - Geographic anomalies
}
```

---

## 📊 **Exporters & Integrations**

### **Built-in Exporters**
```rust
// JSON Lines for log aggregation
.with_exporter(JsonFileExporter::new("audit.jsonl"))

// Prometheus metrics
.with_exporter(PrometheusExporter::new("http://localhost:9090"))

// OpenTelemetry traces
.with_exporter(OpenTelemetryExporter::new(jaeger_endpoint))

// Elasticsearch for search
.with_exporter(ElasticsearchExporter::new(es_client))

// Custom exporters
.with_exporter(MyCustomExporter::new(my_backend))
```

### **Cloud Integrations**
```rust
// AWS CloudWatch
.with_exporter(CloudWatchExporter::new(aws_config))

// Azure Monitor
.with_exporter(AzureMonitorExporter::new(azure_config))

// Google Cloud Monitoring
.with_exporter(GCPMonitoringExporter::new(gcp_config))

// Datadog
.with_exporter(DatadogExporter::new(datadog_config))
```

---

## 🛡️ **Privacy & Security**

### **Automatic PII Protection**
```rust
#[derive(Observable)]
struct UserProfile {
    #[pii(strategy = "hash")]
    email: String,
    
    #[pii(strategy = "redact")]
    social_security: String,
    
    #[pii(strategy = "encrypt")]
    address: Address,
    
    // Non-PII fields logged normally
    user_id: Uuid,
    created_at: DateTime<Utc>,
}
```

### **Compliance Frameworks**
```rust
// Built-in compliance support
use rust_observability_toolkit::compliance::*;

// SOX - Sarbanes-Oxley Act
SOXCompliance::ensure_immutable_audit_trail()?;

// HIPAA - Healthcare data protection
HIPAACompliance::ensure_phi_protection()?;

// GDPR - European data protection
GDPRCompliance::ensure_consent_tracking()?;

// PCI-DSS - Payment card industry
PCIDSSCompliance::ensure_secure_logging()?;
```

---

## ⚡ **Performance**

### **Zero-Overhead Promise**
- **Compile-time optimization** - unnecessary code removed in release builds
- **Sub-1ms latency** - configurable overhead budget
- **Memory efficient** - streaming data processing
- **CPU efficient** - minimal impact on hot paths

### **Benchmarks**
```
Overhead Measurements (release build):
├── Function entry/exit:     ~100ns
├── Parameter capture:       ~50ns per param
├── Performance tracking:    ~200ns
├── Audit log creation:      ~300ns
└── Export to backend:       ~async/background

Total overhead per operation: < 1ms (configurable)
```

---

## 🔌 **Ecosystem**

### **Framework Integrations**
- **Axum** - Web framework integration
- **Actix-web** - Actor-based web framework
- **Warp** - Lightweight web framework
- **Tokio** - Async runtime integration
- **Diesel** - Database ORM integration
- **SQLx** - Async database integration

### **Cargo Features**
```toml
[dependencies]
rust-observability-toolkit = { 
    version = "0.1.0", 
    features = [
        "axum",           # Axum web framework integration
        "diesel",         # Diesel ORM integration
        "compliance-sox", # SOX compliance support
        "compliance-gdpr", # GDPR compliance support
        "cloud-aws",      # AWS integrations
        "forensic-mode",  # Forensic-grade audit trails
        "performance-profiling", # Advanced performance analysis
    ]
}
```

---

## 📚 **Examples**

### **Web API with Automatic Observability**
```rust
use axum::{Router, routing::post, Json};
use rust_observability_toolkit::prelude::*;

#[derive(Observable)]
struct ApiHandler {
    db: Database,
}

impl ApiHandler {
    #[observe(
        operation = "api_user_creation",
        audit_level = "full",
        compliance = ["SOX", "GDPR"],
        performance_tracking = true
    )]
    async fn create_user(
        &self, 
        Json(request): Json<CreateUserRequest>
    ) -> Result<Json<CreateUserResponse>, ApiError> {
        // Business logic
        let user = self.db.create_user(request.into()).await?;
        
        // Observability happens automatically:
        // - API request/response logged
        // - Database operations tracked
        // - Performance metrics collected
        // - Compliance audit created
        // - Security events monitored
        
        Ok(Json(user.into()))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize observability
    let _observability = ObservabilityBuilder::new()
        .with_policy_from_env()?
        .with_axum_integration()
        .with_cloud_exporter()
        .build()
        .await?;
    
    // Build your app normally
    let handler = ApiHandler::new(database).await?;
    let app = Router::new()
        .route("/users", post(handler.create_user))
        .with_observability(); // One line adds observability to all routes!
    
    // Run your server
    axum::Server::bind(&"0.0.0.0:3000".parse()?)
        .serve(app.into_make_service())
        .await?;
    
    Ok(())
}
```

### **Database Operations with Automatic Audit**
```rust
use rust_observability_toolkit::prelude::*;

#[derive(Observable)]
struct UserRepository {
    pool: DatabasePool,
}

impl UserRepository {
    #[observe(
        operation = "database_read",
        data_classification = "pii",
        audit_level = "forensic"
    )]
    async fn get_user_by_id(&self, id: UserId) -> Result<Option<User>, DatabaseError> {
        // Automatically creates:
        // - Data access audit log
        // - Query performance metrics
        // - Security access record
        // - Compliance data access trail
        
        sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", id)
            .fetch_optional(&self.pool)
            .await
            .map_err(DatabaseError::from)
    }
    
    #[observe(
        operation = "database_write",
        data_classification = "pii",
        audit_level = "forensic",
        compliance = ["SOX", "GDPR"]
    )]
    async fn create_user(&self, user: NewUser) -> Result<User, DatabaseError> {
        // Automatically creates:
        // - Data modification audit log
        // - Before/after state capture
        // - Compliance record creation
        // - Security event logging
        
        sqlx::query_as!(
            User,
            "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
            user.name,
            user.email
        )
        .fetch_one(&self.pool)
        .await
        .map_err(DatabaseError::from)
    }
}
```

---

## 🤝 **Contributing**

We welcome contributions! This toolkit was born from enterprise needs but belongs to the community.

### **How to Contribute**
1. **Star the repo** ⭐ - help others discover it
2. **Report issues** - help us improve
3. **Submit PRs** - add features or fix bugs
4. **Write examples** - help others learn
5. **Improve docs** - make it more accessible

### **Areas We Need Help**
- 🔧 **More exporters** - integrate with more backends
- 🏗️ **Framework integrations** - support more Rust frameworks  
- 📊 **Dashboard tooling** - visualization and analytics
- 🧪 **Testing** - more comprehensive test coverage
- 📚 **Documentation** - examples and tutorials
- 🌍 **Internationalization** - multi-language support

---

## 📄 **License**

**MIT License** - Use it anywhere, commercial or open source!

---

## 🙏 **Credits**

Built by the Rust community, for the Rust community. Special thanks to:
- The **Tokio team** for async runtime excellence
- The **Serde team** for serialization magic  
- The **Tracing team** for observability foundations
- The **entire Rust community** for making this possible

---

## 🚀 **Get Started Today**

```bash
cargo add rust-observability-toolkit
```

Add one line to your main function, sprinkle some attributes on your structs and functions, and get **enterprise-grade observability** with **zero manual work**.

**Stop writing logging code. Start observing everything.** 

**Made with ❤️ by the Rust community, for the Rust community** 🦀
