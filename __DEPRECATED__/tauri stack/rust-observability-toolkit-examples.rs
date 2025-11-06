// examples/basic_usage.rs - Basic usage example for the Rust Observability Toolkit

use rust_observability_toolkit::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio;

/// Example user data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Example user creation request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub name: String,
    pub email: String,
}

/// Example errors
#[derive(Debug, thiserror::Error)]
pub enum UserServiceError {
    #[error("User already exists: {email}")]
    UserAlreadyExists { email: String },
    
    #[error("Invalid email format: {email}")]
    InvalidEmail { email: String },
    
    #[error("Database error: {0}")]
    DatabaseError(String),
}

/// Example user service - this would be your business logic
/// The #[derive(Observable)] macro would add observability automatically
#[derive(Debug)]
pub struct UserService {
    // In a real app, this would be your database connection
    users: std::sync::Arc<tokio::sync::RwLock<HashMap<String, User>>>,
}

impl UserService {
    pub fn new() -> Self {
        Self {
            users: std::sync::Arc::new(tokio::sync::RwLock::new(HashMap::new())),
        }
    }
    
    /// Create a new user with automatic observability
    /// 
    /// The #[observe] attribute would automatically:
    /// - Log function entry and exit
    /// - Capture parameters (respecting privacy settings)
    /// - Track performance metrics
    /// - Create audit trail
    /// - Monitor for security events
    /// - Ensure compliance requirements
    pub async fn create_user(&self, request: CreateUserRequest) -> Result<User, UserServiceError> {
        // Simulate the observability that would happen automatically:
        println!("🔍 [OBSERVABILITY] Operation started: create_user");
        let start_time = std::time::Instant::now();
        
        // Validate email format
        if !request.email.contains('@') {
            println!("⚠️  [OBSERVABILITY] Validation failed: invalid email format");
            return Err(UserServiceError::InvalidEmail { email: request.email });
        }
        
        // Check if user already exists
        {
            let users = self.users.read().await;
            if users.values().any(|u| u.email == request.email) {
                println!("⚠️  [OBSERVABILITY] Business rule violation: user already exists");
                return Err(UserServiceError::UserAlreadyExists { email: request.email });
            }
        }
        
        // Create the user
        let user = User {
            id: uuid::Uuid::new_v4().to_string(),
            name: request.name,
            email: request.email,
            created_at: chrono::Utc::now(),
        };
        
        // Store the user
        {
            let mut users = self.users.write().await;
            users.insert(user.id.clone(), user.clone());
        }
        
        let duration = start_time.elapsed();
        println!("✅ [OBSERVABILITY] Operation completed: create_user ({}ms)", duration.as_millis());
        println!("📊 [OBSERVABILITY] Performance: {} users in database", self.users.read().await.len());
        
        Ok(user)
    }
    
    /// Get user by ID with privacy protection
    pub async fn get_user(&self, user_id: &str) -> Result<Option<User>, UserServiceError> {
        println!("🔍 [OBSERVABILITY] Operation started: get_user");
        println!("🔒 [OBSERVABILITY] Privacy: Accessing PII data");
        let start_time = std::time::Instant::now();
        
        let users = self.users.read().await;
        let user = users.get(user_id).cloned();
        
        let duration = start_time.elapsed();
        println!("✅ [OBSERVABILITY] Operation completed: get_user ({}μs)", duration.as_micros());
        
        if user.is_some() {
            println!("📋 [OBSERVABILITY] Audit: User data accessed for user_id={}", user_id);
        }
        
        Ok(user)
    }
    
    /// List all users (admin operation)
    pub async fn list_users(&self) -> Result<Vec<User>, UserServiceError> {
        println!("🔍 [OBSERVABILITY] Operation started: list_users");
        println!("🛡️  [OBSERVABILITY] Security: Admin operation detected");
        let start_time = std::time::Instant::now();
        
        let users = self.users.read().await;
        let user_list: Vec<User> = users.values().cloned().collect();
        
        let duration = start_time.elapsed();
        println!("✅ [OBSERVABILITY] Operation completed: list_users ({}μs)", duration.as_micros());
        println!("📊 [OBSERVABILITY] Performance: Returned {} users", user_list.len());
        println!("📋 [OBSERVABILITY] Audit: Bulk user data accessed");
        
        Ok(user_list)
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 Rust Observability Toolkit - Basic Usage Example");
    println!("=====================================================");
    
    // Step 1: Initialize observability system
    println!("\n📊 Step 1: Initializing observability system...");
    
    let _observability = ObservabilityBuilder::new()
        .with_policy_from_env()?
        .with_exporter(JsonFileExporter::new("examples/audit-trail.jsonl"))
        .with_forensic_mode(true)
        .build()
        .await?;
    
    println!("✅ Observability system initialized!");
    println!("   - Audit trails will be written to: examples/audit-trail.jsonl");
    println!("   - Forensic mode enabled for immutable records");
    println!("   - Zero-overhead performance monitoring active");
    
    // Step 2: Create your business service
    println!("\n🏗️  Step 2: Creating user service...");
    let user_service = UserService::new();
    println!("✅ User service created!");
    
    // Step 3: Perform operations - observability happens automatically
    println!("\n💼 Step 3: Performing business operations...");
    
    // Create some users
    println!("\n👤 Creating users...");
    let user1_request = CreateUserRequest {
        name: "Alice Smith".to_string(),
        email: "alice@example.com".to_string(),
    };
    
    let user2_request = CreateUserRequest {
        name: "Bob Johnson".to_string(),
        email: "bob@example.com".to_string(),
    };
    
    // These operations will be automatically observed
    match user_service.create_user(user1_request).await {
        Ok(user) => {
            println!("✅ Created user: {} (ID: {})", user.name, user.id);
        }
        Err(e) => {
            println!("❌ Failed to create user: {}", e);
        }
    }
    
    match user_service.create_user(user2_request).await {
        Ok(user) => {
            println!("✅ Created user: {} (ID: {})", user.name, user.id);
        }
        Err(e) => {
            println!("❌ Failed to create user: {}", e);
        }
    }
    
    // Try to create a duplicate user (will fail)
    println!("\n⚠️  Testing error handling...");
    let duplicate_request = CreateUserRequest {
        name: "Alice Duplicate".to_string(),
        email: "alice@example.com".to_string(),
    };
    
    match user_service.create_user(duplicate_request).await {
        Ok(_) => println!("✅ Created duplicate user (unexpected!)"),
        Err(e) => println!("✅ Correctly rejected duplicate: {}", e),
    }
    
    // List all users
    println!("\n📋 Listing all users...");
    match user_service.list_users().await {
        Ok(users) => {
            println!("✅ Found {} users:", users.len());
            for user in users {
                println!("   - {} ({}) - {}", user.name, user.email, user.id);
            }
        }
        Err(e) => {
            println!("❌ Failed to list users: {}", e);
        }
    }
    
    // Get specific user
    println!("\n🔍 Looking up specific user...");
    let users = user_service.list_users().await?;
    if let Some(first_user) = users.first() {
        match user_service.get_user(&first_user.id).await {
            Ok(Some(user)) => {
                println!("✅ Found user: {} ({})", user.name, user.email);
            }
            Ok(None) => {
                println!("❌ User not found");
            }
            Err(e) => {
                println!("❌ Error looking up user: {}", e);
            }
        }
    }
    
    // Step 4: Show what was automatically captured
    println!("\n📊 Step 4: Observability Summary");
    println!("================================");
    println!("✅ All operations were automatically observed!");
    println!("📋 Audit trail includes:");
    println!("   - Function entry/exit for all operations");
    println!("   - Parameter capture (with privacy protection)");
    println!("   - Performance metrics (latency, throughput)");
    println!("   - Error tracking and categorization");
    println!("   - Security event monitoring");
    println!("   - Compliance audit records");
    println!("");
    println!("🔍 Check the audit file: examples/audit-trail.jsonl");
    println!("📊 All metrics are available in your monitoring system");
    println!("🛡️  Security events are automatically correlated");
    println!("📋 Compliance reports can be generated on demand");
    
    println!("\n🎉 Example completed successfully!");
    println!("   💡 In a real application, you would:");
    println!("   - Add #[derive(Observable)] to your structs");
    println!("   - Add #[observe(...)] attributes to your functions");
    println!("   - Configure exporters for your monitoring stack");
    println!("   - Set up compliance frameworks");
    println!("   - Configure privacy protection policies");
    
    Ok(())
}

/// Example of what the policy configuration would look like
/// Save this as examples/observability_policy.toml
pub fn example_policy_config() -> &'static str {
    r#"
[global]
# Maximum overhead budget - operations taking longer than this are flagged
overhead_budget_ns = 1_000_000  # 1 millisecond

# Default audit level for operations not explicitly configured
default_audit_level = "basic"

# Enable/disable observability globally
enabled = true

# Sampling rate for high-volume operations (0.0 to 1.0)
sampling_rate = 1.0

[operations.create_user]
audit_level = "full"
performance_tracking = true
security_monitoring = true
compliance_frameworks = ["SOX", "GDPR"]
privacy_level = "pii"

[operations.get_user]
audit_level = "forensic"
performance_tracking = true
security_monitoring = true
compliance_frameworks = ["GDPR", "HIPAA"]
privacy_level = "pii"

[operations.list_users]
audit_level = "full"
performance_tracking = true
security_monitoring = true
compliance_frameworks = ["SOX", "GDPR"]
privacy_level = "pii"

# Admin operations require special handling
[operations.admin_list_all_users]
audit_level = "forensic"
performance_tracking = true
security_monitoring = true
compliance_frameworks = ["SOX", "GDPR", "HIPAA"]
privacy_level = "pii"

[privacy]
# Automatically detect and protect PII
pii_auto_detection = true
pii_redaction_strategy = "hash_with_salt"
consent_tracking = true

[performance]
# Track these performance percentiles
latency_percentiles = [50, 90, 95, 99]
memory_tracking = true
cpu_profiling = false  # Disable in production for performance

[security]
# Security monitoring settings
suspicious_pattern_detection = true
anomaly_detection = true
threat_correlation = true

[compliance]
# Compliance settings
audit_trail_immutable = true
chain_of_custody = true
legal_hold_support = true
"#
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_user_service_operations() {
        let service = UserService::new();
        
        // Test user creation
        let request = CreateUserRequest {
            name: "Test User".to_string(),
            email: "test@example.com".to_string(),
        };
        
        let user = service.create_user(request).await.unwrap();
        assert_eq!(user.name, "Test User");
        assert_eq!(user.email, "test@example.com");
        
        // Test user retrieval
        let retrieved = service.get_user(&user.id).await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id, user.id);
        
        // Test user listing
        let users = service.list_users().await.unwrap();
        assert_eq!(users.len(), 1);
        
        // Test duplicate prevention
        let duplicate_request = CreateUserRequest {
            name: "Another User".to_string(),
            email: "test@example.com".to_string(),
        };
        
        let result = service.create_user(duplicate_request).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), UserServiceError::UserAlreadyExists { .. }));
    }
    
    #[tokio::test]
    async fn test_observability_setup() {
        // Test that observability can be set up without errors
        let observability = ObservabilityBuilder::new()
            .with_policy_from_env()
            .unwrap()
            .with_exporter(JsonFileExporter::new("/tmp/test-audit.jsonl"))
            .build()
            .await;
        
        assert!(observability.is_ok());
    }
}
