// src-tauri/src/enterprise/api_gateway.rs
// Enterprise API Gateway - Advanced API Management and Security
// Provides enterprise-grade API routing, rate limiting, authentication, and monitoring

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use std::net::SocketAddr;

use crate::security::{SecurityManager, ClassificationLevel, SecurityLabel};
use crate::license::{LicenseManager, LicenseTier};
use crate::observability::{ForensicLogger, MetricsRegistry};
use crate::enterprise::multi_tenant::MultiTenantSystem;
use crate::state::AppState;

/// Enterprise API Gateway for advanced API management
#[derive(Debug)]
pub struct EnterpriseAPIGateway {
    /// API route configurations
    routes: Arc<RwLock<HashMap<String, APIRoute>>>,
    
    /// Rate limiting engine
    rate_limiter: RateLimitingEngine,
    
    /// API authentication manager
    auth_manager: APIAuthenticationManager,
    
    /// Request/response transformation engine
    transformer: RequestTransformer,
    
    /// API monitoring and analytics
    analytics: APIAnalytics,
    
    /// Security manager for access control
    security_manager: Arc<SecurityManager>,
    
    /// License manager for feature gating
    license_manager: Arc<LicenseManager>,
    
    /// Forensic logger for API operations
    forensic_logger: Arc<ForensicLogger>,
    
    /// Metrics registry for API metrics
    metrics_registry: Arc<MetricsRegistry>,
    
    /// Multi-tenant system for tenant isolation
    multi_tenant_system: Arc<MultiTenantSystem>,
    
    /// Load balancer for backend services
    load_balancer: LoadBalancer,
    
    /// Circuit breaker for fault tolerance
    circuit_breakers: Arc<RwLock<HashMap<String, CircuitBreaker>>>,
}

/// API route configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIRoute {
    /// Route identifier
    pub route_id: String,
    
    /// Route path pattern
    pub path_pattern: String,
    
    /// HTTP methods allowed
    pub methods: Vec<HttpMethod>,
    
    /// Backend configuration
    pub backend: BackendConfig,
    
    /// Authentication requirements
    pub auth_config: RouteAuthConfig,
    
    /// Rate limiting configuration
    pub rate_limit_config: RouteLimitConfig,
    
    /// Request/response transformation
    pub transformations: Vec<Transformation>,
    
    /// Caching configuration
    pub cache_config: Option<CacheConfig>,
    
    /// Circuit breaker configuration
    pub circuit_breaker_config: CircuitBreakerConfig,
    
    /// Tenant access configuration
    pub tenant_access: TenantAccessConfig,
    
    /// Security policies
    pub security_policies: Vec<SecurityPolicy>,
    
    /// Monitoring configuration
    pub monitoring_config: MonitoringConfig,
    
    /// Route metadata
    pub metadata: RouteMetadata,
}

/// HTTP methods
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    OPTIONS,
}

/// Backend service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    /// Backend service type
    pub backend_type: BackendType,
    
    /// Service endpoints
    pub endpoints: Vec<ServiceEndpoint>,
    
    /// Load balancing strategy
    pub load_balancing: LoadBalancingStrategy,
    
    /// Health check configuration
    pub health_check: HealthCheckConfig,
    
    /// Timeout configuration
    pub timeouts: TimeoutConfig,
    
    /// Retry configuration
    pub retry_config: RetryConfig,
}

/// Backend service types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackendType {
    /// HTTP/HTTPS backend service
    HTTP,
    
    /// gRPC backend service
    GRPC,
    
    /// WebSocket backend service
    WebSocket,
    
    /// Database query backend
    Database,
    
    /// Serverless function
    Serverless,
    
    /// Mock/stub for testing
    Mock,
}

/// Service endpoint configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceEndpoint {
    pub endpoint_id: String,
    pub host: String,
    pub port: u16,
    pub path: String,
    pub weight: u32,
    pub status: EndpointStatus,
    pub metadata: HashMap<String, String>,
}

/// Endpoint operational status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EndpointStatus {
    Healthy,
    Unhealthy,
    Maintenance,
    Disabled,
}

/// Load balancing strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LoadBalancingStrategy {
    RoundRobin,
    WeightedRoundRobin,
    LeastConnections,
    LeastResponseTime,
    IpHash,
    Random,
    GeoLocation,
}

/// Health check configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckConfig {
    pub enabled: bool,
    pub path: String,
    pub interval_seconds: u32,
    pub timeout_seconds: u32,
    pub healthy_threshold: u32,
    pub unhealthy_threshold: u32,
    pub expected_status_codes: Vec<u16>,
    pub expected_response_body: Option<String>,
}

/// Timeout configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeoutConfig {
    pub connection_timeout_ms: u32,
    pub request_timeout_ms: u32,
    pub response_timeout_ms: u32,
    pub idle_timeout_ms: u32,
}

/// Retry configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub enabled: bool,
    pub max_retries: u32,
    pub retry_delay_ms: u32,
    pub backoff_strategy: BackoffStrategy,
    pub retryable_status_codes: Vec<u16>,
    pub retryable_errors: Vec<String>,
}

/// Backoff strategies for retries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BackoffStrategy {
    Fixed,
    Linear,
    Exponential,
    ExponentialWithJitter,
}

/// Route authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteAuthConfig {
    /// Authentication required
    pub auth_required: bool,
    
    /// Authentication methods
    pub auth_methods: Vec<AuthMethod>,
    
    /// API key configuration
    pub api_key_config: Option<ApiKeyConfig>,
    
    /// JWT configuration
    pub jwt_config: Option<JwtConfig>,
    
    /// OAuth configuration
    pub oauth_config: Option<OAuthConfig>,
    
    /// Custom authentication
    pub custom_auth: Option<CustomAuthConfig>,
    
    /// Authorization policies
    pub authorization_policies: Vec<AuthorizationPolicy>,
}

/// Authentication methods
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthMethod {
    ApiKey,
    JWT,
    OAuth2,
    BasicAuth,
    Custom,
    None,
}

/// API key configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyConfig {
    pub header_name: String,
    pub query_param_name: Option<String>,
    pub key_validation: KeyValidation,
}

/// Key validation strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum KeyValidation {
    Database,
    InMemory,
    External,
}

/// JWT configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtConfig {
    pub signing_algorithm: String,
    pub public_key: String,
    pub issuer: Option<String>,
    pub audience: Option<String>,
    pub expiry_tolerance_seconds: u32,
}

/// OAuth configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthConfig {
    pub provider: String,
    pub client_id: String,
    pub scopes: Vec<String>,
    pub token_endpoint: String,
    pub introspection_endpoint: String,
}

/// Custom authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomAuthConfig {
    pub authenticator_name: String,
    pub configuration: serde_json::Value,
}

/// Authorization policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizationPolicy {
    pub policy_id: String,
    pub policy_type: AuthorizationPolicyType,
    pub rules: Vec<AuthorizationRule>,
    pub enforcement_mode: EnforcementMode,
}

/// Authorization policy types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthorizationPolicyType {
    RBAC,
    ABAC,
    ACL,
    Custom,
}

/// Authorization rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizationRule {
    pub rule_id: String,
    pub subject: String,
    pub resource: String,
    pub action: String,
    pub conditions: Vec<RuleCondition>,
    pub effect: RuleEffect,
}

/// Rule condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleCondition {
    pub attribute: String,
    pub operator: ConditionOperator,
    pub value: serde_json::Value,
}

/// Condition operators
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    GreaterThan,
    LessThan,
    Contains,
    StartsWith,
    EndsWith,
    In,
    NotIn,
}

/// Rule effects
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleEffect {
    Allow,
    Deny,
}

/// Enforcement modes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EnforcementMode {
    Enforce,
    Monitor,
    Warn,
}

/// Route rate limiting configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteLimitConfig {
    /// Rate limiting enabled
    pub enabled: bool,
    
    /// Rate limit rules
    pub rules: Vec<RateLimitRule>,
    
    /// Burst capacity
    pub burst_capacity: u32,
    
    /// Rate limit response
    pub limit_response: LimitResponse,
}

/// Rate limiting rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitRule {
    pub rule_id: String,
    pub rule_type: RateLimitType,
    pub limit: u32,
    pub window_seconds: u32,
    pub scope: RateLimitScope,
    pub conditions: Vec<RateLimitCondition>,
}

/// Rate limit types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RateLimitType {
    RequestsPerSecond,
    RequestsPerMinute,
    RequestsPerHour,
    RequestsPerDay,
    BandwidthPerSecond,
    ConcurrentRequests,
}

/// Rate limit scopes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RateLimitScope {
    Global,
    PerApiKey,
    PerUser,
    PerTenant,
    PerIP,
    Custom,
}

/// Rate limit condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitCondition {
    pub condition_type: String,
    pub parameters: serde_json::Value,
}

/// Response when rate limit is exceeded
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitResponse {
    pub status_code: u16,
    pub message: String,
    pub headers: HashMap<String, String>,
    pub retry_after_seconds: Option<u32>,
}

/// Request/response transformation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transformation {
    pub transformation_id: String,
    pub transformation_type: TransformationType,
    pub stage: TransformationStage,
    pub configuration: serde_json::Value,
}

/// Transformation types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransformationType {
    HeaderModification,
    BodyTransformation,
    PathRewriting,
    QueryParameterModification,
    ResponseModification,
    ContentTypeConversion,
    Validation,
    Enrichment,
}

/// Transformation stages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransformationStage {
    PreAuth,
    PostAuth,
    PreBackend,
    PostBackend,
    PreResponse,
}

/// Caching configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub enabled: bool,
    pub cache_key_strategy: CacheKeyStrategy,
    pub ttl_seconds: u32,
    pub cache_conditions: Vec<CacheCondition>,
    pub cache_invalidation: CacheInvalidationConfig,
}

/// Cache key generation strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CacheKeyStrategy {
    PathOnly,
    PathAndQuery,
    PathAndHeaders,
    Custom,
}

/// Cache condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheCondition {
    pub condition_type: String,
    pub parameters: serde_json::Value,
}

/// Cache invalidation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheInvalidationConfig {
    pub auto_invalidation: bool,
    pub invalidation_patterns: Vec<String>,
    pub max_cache_size: u64,
}

/// Circuit breaker configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerConfig {
    pub enabled: bool,
    pub failure_threshold: u32,
    pub success_threshold: u32,
    pub timeout_duration_ms: u32,
    pub half_open_max_calls: u32,
}

/// Tenant access configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantAccessConfig {
    pub multi_tenant: bool,
    pub tenant_identification: TenantIdentification,
    pub tenant_isolation: bool,
    pub allowed_tenants: Option<Vec<String>>,
    pub tenant_routing: TenantRoutingStrategy,
}

/// Tenant identification strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TenantIdentification {
    Header,
    Subdomain,
    Path,
    QueryParameter,
    JWT,
    ApiKey,
}

/// Tenant routing strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TenantRoutingStrategy {
    SharedBackend,
    DedicatedBackend,
    PerTenantBackend,
}

/// Security policy for API routes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityPolicy {
    pub policy_id: String,
    pub policy_type: SecurityPolicyType,
    pub configuration: serde_json::Value,
    pub enforcement_mode: EnforcementMode,
}

/// Security policy types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityPolicyType {
    CORS,
    CSP,
    InputValidation,
    OutputSanitization,
    ThreatDetection,
    DDoSProtection,
    IPWhitelisting,
    GeoBlocking,
}

/// Monitoring configuration for routes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringConfig {
    pub metrics_enabled: bool,
    pub tracing_enabled: bool,
    pub logging_enabled: bool,
    pub alerting_rules: Vec<AlertingRule>,
    pub sla_config: Option<SLAConfig>,
}

/// Alerting rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertingRule {
    pub rule_id: String,
    pub metric: String,
    pub threshold: f64,
    pub comparison: ComparisonOperator,
    pub window_seconds: u32,
    pub severity: AlertSeverity,
    pub channels: Vec<String>,
}

/// Comparison operators for alerting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComparisonOperator {
    GreaterThan,
    LessThan,
    Equals,
    NotEquals,
    GreaterThanOrEqual,
    LessThanOrEqual,
}

/// Alert severity levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

/// SLA configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SLAConfig {
    pub availability_target: f64,
    pub response_time_target_ms: u32,
    pub error_rate_target: f64,
    pub throughput_target: u32,
}

/// Route metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteMetadata {
    pub name: String,
    pub description: String,
    pub version: String,
    pub owner: String,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deprecation_date: Option<DateTime<Utc>>,
}

/// Rate limiting engine
#[derive(Debug)]
pub struct RateLimitingEngine {
    /// Rate limit counters
    counters: Arc<RwLock<HashMap<String, RateLimitCounter>>>,
    
    /// Rate limit rules cache
    rules_cache: Arc<RwLock<HashMap<String, Vec<RateLimitRule>>>>,
}

/// Rate limit counter
#[derive(Debug, Clone)]
pub struct RateLimitCounter {
    pub current_count: u32,
    pub window_start: DateTime<Utc>,
    pub window_duration: Duration,
    pub limit: u32,
}

/// API authentication manager
#[derive(Debug)]
pub struct APIAuthenticationManager {
    /// Authentication providers
    providers: HashMap<AuthMethod, Box<dyn AuthenticationProvider>>,
    
    /// API key store
    api_keys: Arc<RwLock<HashMap<String, ApiKeyInfo>>>,
    
    /// JWT validator
    jwt_validator: JwtValidator,
}

/// API key information
#[derive(Debug, Clone)]
pub struct ApiKeyInfo {
    pub key_id: String,
    pub tenant_id: Option<String>,
    pub user_id: Option<String>,
    pub scopes: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used: Option<DateTime<Utc>>,
    pub usage_count: u64,
}

/// JWT validator
#[derive(Debug)]
pub struct JwtValidator {
    /// Public keys for validation
    public_keys: HashMap<String, String>,
}

/// Authentication provider trait
pub trait AuthenticationProvider: Send + Sync {
    fn authenticate(&self, request: &APIRequest) -> Result<AuthenticationResult, AuthError>;
    fn get_auth_method(&self) -> AuthMethod;
}

/// Authentication result
#[derive(Debug, Clone)]
pub struct AuthenticationResult {
    pub authenticated: bool,
    pub user_id: Option<String>,
    pub tenant_id: Option<String>,
    pub scopes: Vec<String>,
    pub metadata: HashMap<String, String>,
}

/// Request transformer
#[derive(Debug)]
pub struct RequestTransformer {
    /// Transformation processors
    processors: HashMap<TransformationType, Box<dyn TransformationProcessor>>,
}

/// Transformation processor trait
pub trait TransformationProcessor: Send + Sync {
    fn transform(&self, request: &mut APIRequest, config: &serde_json::Value) -> Result<(), TransformationError>;
    fn get_transformation_type(&self) -> TransformationType;
}

/// API analytics engine
#[derive(Debug)]
pub struct APIAnalytics {
    /// Metrics collectors
    metrics_collectors: Vec<Box<dyn MetricsCollector>>,
    
    /// Analytics data store
    analytics_store: Arc<RwLock<HashMap<String, AnalyticsData>>>,
}

/// Metrics collector trait
pub trait MetricsCollector: Send + Sync {
    fn collect_metrics(&self, request: &APIRequest, response: &APIResponse, duration: Duration);
    fn get_metrics_name(&self) -> String;
}

/// Analytics data
#[derive(Debug, Clone)]
pub struct AnalyticsData {
    pub route_id: String,
    pub request_count: u64,
    pub response_times: Vec<u32>,
    pub error_count: u64,
    pub last_updated: DateTime<Utc>,
}

/// Load balancer
#[derive(Debug)]
pub struct LoadBalancer {
    /// Load balancing strategies
    strategies: HashMap<LoadBalancingStrategy, Box<dyn LoadBalancingStrategy>>,
    
    /// Backend health status
    backend_health: Arc<RwLock<HashMap<String, EndpointStatus>>>,
}

/// Load balancing strategy trait
pub trait LoadBalancingStrategy: Send + Sync {
    fn select_backend(&self, endpoints: &[ServiceEndpoint], request: &APIRequest) -> Option<ServiceEndpoint>;
    fn get_strategy_type(&self) -> LoadBalancingStrategy;
}

/// Circuit breaker implementation
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    pub state: CircuitBreakerState,
    pub failure_count: u32,
    pub success_count: u32,
    pub last_failure_time: Option<DateTime<Utc>>,
    pub config: CircuitBreakerConfig,
}

/// Circuit breaker states
#[derive(Debug, Clone)]
pub enum CircuitBreakerState {
    Closed,
    Open,
    HalfOpen,
}

/// API request representation
#[derive(Debug, Clone)]
pub struct APIRequest {
    pub request_id: String,
    pub method: HttpMethod,
    pub path: String,
    pub query_params: HashMap<String, String>,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub remote_addr: SocketAddr,
    pub timestamp: DateTime<Utc>,
    pub tenant_id: Option<String>,
    pub user_id: Option<String>,
}

/// API response representation
#[derive(Debug, Clone)]
pub struct APIResponse {
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub processing_time_ms: u32,
}

/// Gateway errors
#[derive(Debug, thiserror::Error)]
pub enum GatewayError {
    #[error("Route not found: {path}")]
    RouteNotFound { path: String },
    
    #[error("Authentication failed: {reason}")]
    AuthenticationFailed { reason: String },
    
    #[error("Authorization failed: {reason}")]
    AuthorizationFailed { reason: String },
    
    #[error("Rate limit exceeded: {limit_type}")]
    RateLimitExceeded { limit_type: String },
    
    #[error("Backend error: {backend_id}, error: {error}")]
    BackendError { backend_id: String, error: String },
    
    #[error("Circuit breaker open: {service}")]
    CircuitBreakerOpen { service: String },
    
    #[error("Transformation failed: {transformation_id}, error: {error}")]
    TransformationFailed { 
        transformation_id: String, 
        error: String 
    },
    
    #[error("Insufficient license for API gateway features: requires {required_license:?}")]
    InsufficientLicense { required_license: LicenseTier },
}

/// Authentication errors
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Invalid credentials")]
    InvalidCredentials,
    
    #[error("Token expired")]
    TokenExpired,
    
    #[error("Token invalid")]
    TokenInvalid,
    
    #[error("API key not found")]
    ApiKeyNotFound,
    
    #[error("Authentication provider error: {error}")]
    ProviderError { error: String },
}

/// Transformation errors
#[derive(Debug, thiserror::Error)]
pub enum TransformationError {
    #[error("Invalid configuration: {config}")]
    InvalidConfiguration { config: String },
    
    #[error("Transformation failed: {reason}")]
    TransformationFailed { reason: String },
    
    #[error("Validation failed: {validation_error}")]
    ValidationFailed { validation_error: String },
}

impl EnterpriseAPIGateway {
    /// Create new enterprise API gateway
    pub async fn new(
        security_manager: Arc<SecurityManager>,
        license_manager: Arc<LicenseManager>,
        forensic_logger: Arc<ForensicLogger>,
        metrics_registry: Arc<MetricsRegistry>,
        multi_tenant_system: Arc<MultiTenantSystem>,
    ) -> Result<Self, GatewayError> {
        // Verify enterprise license for API gateway features
        let current_license = license_manager.get_current_license().await;
        if matches!(current_license.tier, LicenseTier::Community) {
            return Err(GatewayError::InsufficientLicense {
                required_license: LicenseTier::Enterprise,
            });
        }
        
        let rate_limiter = RateLimitingEngine::new().await?;
        let auth_manager = APIAuthenticationManager::new().await?;
        let transformer = RequestTransformer::new().await?;
        let analytics = APIAnalytics::new().await?;
        let load_balancer = LoadBalancer::new().await?;
        
        Ok(Self {
            routes: Arc::new(RwLock::new(HashMap::new())),
            rate_limiter,
            auth_manager,
            transformer,
            analytics,
            security_manager,
            license_manager,
            forensic_logger,
            metrics_registry,
            multi_tenant_system,
            load_balancer,
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
        })
    }
    
    /// Process incoming API request
    pub async fn process_request(
        &self,
        mut request: APIRequest,
        app_state: &AppState,
    ) -> Result<APIResponse, GatewayError> {
        let start_time = Utc::now();
        
        // 1. Find matching route
        let route = self.find_matching_route(&request).await
            .ok_or_else(|| GatewayError::RouteNotFound { path: request.path.clone() })?;
        
        // 2. Apply pre-authentication transformations
        self.apply_transformations(&mut request, &route, TransformationStage::PreAuth).await?;
        
        // 3. Authenticate request
        let auth_result = self.authenticate_request(&request, &route).await?;
        request.user_id = auth_result.user_id;
        request.tenant_id = auth_result.tenant_id;
        
        // 4. Apply post-authentication transformations
        self.apply_transformations(&mut request, &route, TransformationStage::PostAuth).await?;
        
        // 5. Check rate limits
        self.check_rate_limits(&request, &route).await?;
        
        // 6. Authorize request
        self.authorize_request(&request, &route, &auth_result).await?;
        
        // 7. Check circuit breaker
        self.check_circuit_breaker(&route).await?;
        
        // 8. Apply pre-backend transformations
        self.apply_transformations(&mut request, &route, TransformationStage::PreBackend).await?;
        
        // 9. Route to backend
        let mut response = self.route_to_backend(&request, &route).await?;
        
        // 10. Apply post-backend transformations
        self.apply_response_transformations(&mut response, &route, TransformationStage::PostBackend).await?;
        
        // 11. Apply pre-response transformations
        self.apply_response_transformations(&mut response, &route, TransformationStage::PreResponse).await?;
        
        // 12. Update metrics and analytics
        let duration = Utc::now() - start_time;
        self.update_analytics(&request, &response, duration).await;
        
        // 13. Log request for audit
        self.log_api_request(&request, &response, &route, duration, app_state).await?;
        
        Ok(response)
    }
    
    /// Register a new API route
    pub async fn register_route(
        &self,
        route: APIRoute,
        app_state: &AppState,
    ) -> Result<(), GatewayError> {
        let route_id = route.route_id.clone();
        
        // Validate route configuration
        self.validate_route_config(&route).await?;
        
        // Initialize circuit breaker for route
        if route.circuit_breaker_config.enabled {
            self.circuit_breakers.write().await.insert(
                route_id.clone(),
                CircuitBreaker::new(route.circuit_breaker_config.clone()),
            );
        }
        
        // Register route
        self.routes.write().await.insert(route_id.clone(), route.clone());
        
        // Log route registration
        self.forensic_logger.log_api_gateway_operation(
            "route_registered",
            &route_id,
            &app_state.context,
            serde_json::json!({
                "path_pattern": route.path_pattern,
                "methods": route.methods,
                "backend_type": route.backend.backend_type,
            })
        ).await?;
        
        tracing::info!(route_id = %route_id, "API route registered");
        
        Ok(())
    }
    
    /// Unregister an API route
    pub async fn unregister_route(
        &self,
        route_id: &str,
        app_state: &AppState,
    ) -> Result<(), GatewayError> {
        // Remove route
        let route = self.routes.write().await.remove(route_id);
        
        if let Some(route) = route {
            // Remove circuit breaker
            self.circuit_breakers.write().await.remove(route_id);
            
            // Log route unregistration
            self.forensic_logger.log_api_gateway_operation(
                "route_unregistered",
                route_id,
                &app_state.context,
                serde_json::json!({
                    "path_pattern": route.path_pattern,
                })
            ).await?;
            
            tracing::info!(route_id = %route_id, "API route unregistered");
        }
        
        Ok(())
    }
    
    /// Get API gateway metrics
    pub async fn get_gateway_metrics(&self) -> GatewayMetrics {
        let routes = self.routes.read().await;
        let total_routes = routes.len();
        
        let analytics = self.analytics.analytics_store.read().await;
        let total_requests: u64 = analytics.values().map(|data| data.request_count).sum();
        let total_errors: u64 = analytics.values().map(|data| data.error_count).sum();
        
        let error_rate = if total_requests > 0 {
            (total_errors as f64 / total_requests as f64) * 100.0
        } else {
            0.0
        };
        
        GatewayMetrics {
            total_routes,
            total_requests,
            total_errors,
            error_rate,
            average_response_time_ms: self.calculate_average_response_time().await,
            last_updated: Utc::now(),
        }
    }
    
    // Private helper methods
    
    async fn find_matching_route(&self, request: &APIRequest) -> Option<APIRoute> {
        let routes = self.routes.read().await;
        
        for route in routes.values() {
            if self.route_matches(route, request) {
                return Some(route.clone());
            }
        }
        
        None
    }
    
    fn route_matches(&self, route: &APIRoute, request: &APIRequest) -> bool {
        // Check HTTP method
        if !route.methods.contains(&request.method) {
            return false;
        }
        
        // Check path pattern (simplified implementation)
        // In production, this would support wildcards, parameters, etc.
        if route.path_pattern != request.path {
            return false;
        }
        
        true
    }
    
    async fn authenticate_request(
        &self,
        request: &APIRequest,
        route: &APIRoute,
    ) -> Result<AuthenticationResult, GatewayError> {
        if !route.auth_config.auth_required {
            return Ok(AuthenticationResult {
                authenticated: true,
                user_id: None,
                tenant_id: None,
                scopes: vec![],
                metadata: HashMap::new(),
            });
        }
        
        for auth_method in &route.auth_config.auth_methods {
            if let Some(provider) = self.auth_manager.providers.get(auth_method) {
                match provider.authenticate(request) {
                    Ok(result) if result.authenticated => return Ok(result),
                    _ => continue,
                }
            }
        }
        
        Err(GatewayError::AuthenticationFailed {
            reason: "No valid authentication method succeeded".to_string(),
        })
    }
    
    async fn check_rate_limits(
        &self,
        request: &APIRequest,
        route: &APIRoute,
    ) -> Result<(), GatewayError> {
        if !route.rate_limit_config.enabled {
            return Ok(());
        }
        
        for rule in &route.rate_limit_config.rules {
            if self.rate_limiter.check_limit(request, rule).await? {
                return Err(GatewayError::RateLimitExceeded {
                    limit_type: format!("{:?}", rule.rule_type),
                });
            }
        }
        
        Ok(())
    }
    
    async fn authorize_request(
        &self,
        request: &APIRequest,
        route: &APIRoute,
        auth_result: &AuthenticationResult,
    ) -> Result<(), GatewayError> {
        // Check authorization policies
        for policy in &route.auth_config.authorization_policies {
            if !self.evaluate_authorization_policy(policy, request, auth_result).await {
                return Err(GatewayError::AuthorizationFailed {
                    reason: format!("Policy {} denied access", policy.policy_id),
                });
            }
        }
        
        Ok(())
    }
    
    async fn check_circuit_breaker(&self, route: &APIRoute) -> Result<(), GatewayError> {
        if !route.circuit_breaker_config.enabled {
            return Ok(());
        }
        
        let circuit_breakers = self.circuit_breakers.read().await;
        if let Some(circuit_breaker) = circuit_breakers.get(&route.route_id) {
            if matches!(circuit_breaker.state, CircuitBreakerState::Open) {
                return Err(GatewayError::CircuitBreakerOpen {
                    service: route.route_id.clone(),
                });
            }
        }
        
        Ok(())
    }
    
    async fn route_to_backend(
        &self,
        request: &APIRequest,
        route: &APIRoute,
    ) -> Result<APIResponse, GatewayError> {
        // Select backend endpoint
        let endpoint = self.load_balancer
            .select_backend(&route.backend.endpoints, request)
            .ok_or_else(|| GatewayError::BackendError {
                backend_id: route.route_id.clone(),
                error: "No healthy backend available".to_string(),
            })?;
        
        // Make backend request (simplified implementation)
        // In production, this would use actual HTTP client
        let response = APIResponse {
            status_code: 200,
            headers: HashMap::new(),
            body: Some(b"Backend response".to_vec()),
            processing_time_ms: 50,
        };
        
        Ok(response)
    }
    
    async fn apply_transformations(
        &self,
        request: &mut APIRequest,
        route: &APIRoute,
        stage: TransformationStage,
    ) -> Result<(), GatewayError> {
        for transformation in &route.transformations {
            if matches!(transformation.stage, stage) {
                self.transformer
                    .apply_transformation(request, transformation)
                    .await
                    .map_err(|e| GatewayError::TransformationFailed {
                        transformation_id: transformation.transformation_id.clone(),
                        error: e.to_string(),
                    })?;
            }
        }
        
        Ok(())
    }
    
    async fn apply_response_transformations(
        &self,
        response: &mut APIResponse,
        route: &APIRoute,
        stage: TransformationStage,
    ) -> Result<(), GatewayError> {
        // Apply response transformations (simplified implementation)
        Ok(())
    }
    
    async fn update_analytics(&self, request: &APIRequest, response: &APIResponse, duration: Duration) {
        // Update analytics data (simplified implementation)
        tracing::debug!(
            request_id = %request.request_id,
            status = response.status_code,
            duration_ms = duration.num_milliseconds(),
            "API request processed"
        );
    }
    
    async fn log_api_request(
        &self,
        request: &APIRequest,
        response: &APIResponse,
        route: &APIRoute,
        duration: Duration,
        app_state: &AppState,
    ) -> Result<(), GatewayError> {
        self.forensic_logger.log_api_request(
            request,
            response,
            route,
            duration,
            &app_state.context,
        ).await?;
        
        Ok(())
    }
    
    async fn validate_route_config(&self, route: &APIRoute) -> Result<(), GatewayError> {
        // Validate route configuration (simplified implementation)
        if route.path_pattern.is_empty() {
            return Err(GatewayError::TransformationFailed {
                transformation_id: route.route_id.clone(),
                error: "Path pattern cannot be empty".to_string(),
            });
        }
        
        Ok(())
    }
    
    async fn evaluate_authorization_policy(
        &self,
        policy: &AuthorizationPolicy,
        request: &APIRequest,
        auth_result: &AuthenticationResult,
    ) -> bool {
        // Evaluate authorization policy (simplified implementation)
        true
    }
    
    async fn calculate_average_response_time(&self) -> f64 {
        // Calculate average response time from analytics data
        50.0 // Simplified implementation
    }
}

/// Gateway metrics summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayMetrics {
    pub total_routes: usize,
    pub total_requests: u64,
    pub total_errors: u64,
    pub error_rate: f64,
    pub average_response_time_ms: f64,
    pub last_updated: DateTime<Utc>,
}

impl CircuitBreaker {
    fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            state: CircuitBreakerState::Closed,
            failure_count: 0,
            success_count: 0,
            last_failure_time: None,
            config,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_api_route_serialization() {
        let route = APIRoute {
            route_id: "test-route".to_string(),
            path_pattern: "/api/v1/users".to_string(),
            methods: vec![HttpMethod::GET, HttpMethod::POST],
            backend: BackendConfig {
                backend_type: BackendType::HTTP,
                endpoints: vec![],
                load_balancing: LoadBalancingStrategy::RoundRobin,
                health_check: HealthCheckConfig {
                    enabled: true,
                    path: "/health".to_string(),
                    interval_seconds: 30,
                    timeout_seconds: 5,
                    healthy_threshold: 2,
                    unhealthy_threshold: 3,
                    expected_status_codes: vec![200],
                    expected_response_body: None,
                },
                timeouts: TimeoutConfig {
                    connection_timeout_ms: 5000,
                    request_timeout_ms: 30000,
                    response_timeout_ms: 30000,
                    idle_timeout_ms: 60000,
                },
                retry_config: RetryConfig {
                    enabled: true,
                    max_retries: 3,
                    retry_delay_ms: 1000,
                    backoff_strategy: BackoffStrategy::Exponential,
                    retryable_status_codes: vec![502, 503, 504],
                    retryable_errors: vec!["connection_error".to_string()],
                },
            },
            auth_config: RouteAuthConfig {
                auth_required: true,
                auth_methods: vec![AuthMethod::JWT],
                api_key_config: None,
                jwt_config: Some(JwtConfig {
                    signing_algorithm: "RS256".to_string(),
                    public_key: "test-key".to_string(),
                    issuer: Some("test-issuer".to_string()),
                    audience: Some("test-audience".to_string()),
                    expiry_tolerance_seconds: 300,
                }),
                oauth_config: None,
                custom_auth: None,
                authorization_policies: vec![],
            },
            rate_limit_config: RouteLimitConfig {
                enabled: true,
                rules: vec![],
                burst_capacity: 100,
                limit_response: LimitResponse {
                    status_code: 429,
                    message: "Rate limit exceeded".to_string(),
                    headers: HashMap::new(),
                    retry_after_seconds: Some(60),
                },
            },
            transformations: vec![],
            cache_config: None,
            circuit_breaker_config: CircuitBreakerConfig {
                enabled: true,
                failure_threshold: 5,
                success_threshold: 3,
                timeout_duration_ms: 30000,
                half_open_max_calls: 3,
            },
            tenant_access: TenantAccessConfig {
                multi_tenant: true,
                tenant_identification: TenantIdentification::Header,
                tenant_isolation: true,
                allowed_tenants: None,
                tenant_routing: TenantRoutingStrategy::SharedBackend,
            },
            security_policies: vec![],
            monitoring_config: MonitoringConfig {
                metrics_enabled: true,
                tracing_enabled: true,
                logging_enabled: true,
                alerting_rules: vec![],
                sla_config: None,
            },
            metadata: RouteMetadata {
                name: "Users API".to_string(),
                description: "User management API".to_string(),
                version: "1.0.0".to_string(),
                owner: "API Team".to_string(),
                tags: vec!["users".to_string(), "management".to_string()],
                created_at: Utc::now(),
                updated_at: Utc::now(),
                deprecation_date: None,
            },
        };
        
        let json = serde_json::to_string(&route).unwrap();
        let parsed: APIRoute = serde_json::from_str(&json).unwrap();
        
        assert_eq!(route.route_id, parsed.route_id);
        assert_eq!(route.path_pattern, parsed.path_pattern);
    }
}
