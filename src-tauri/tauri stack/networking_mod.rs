// src-tauri/src/networking/mod.rs
// CDS Transport - Secure Networking with Automatic Observability
// Replaces CDS.js and provides enterprise-grade network security

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use uuid::Uuid;
use reqwest::{Client, Response};
use std::time::{Duration, Instant};

use crate::observability::{ObservabilityContext, AutomaticInstrumentation};
use crate::security::{SecurityLabel, ClassificationLevel};
use crate::license::LicenseManager;
use crate::state::AppState;

pub mod cds_transport;
pub mod network_security;
pub mod request_interceptor;
pub mod response_cache;

pub use cds_transport::CDSTransport;
pub use network_security::NetworkSecurityManager;
pub use request_interceptor::RequestInterceptor;
pub use response_cache::ResponseCache;

/// Secure network transport with automatic observability
/// Replaces all direct fetch() calls with audited, policy-compliant networking
#[derive(Debug)]
pub struct SecureNetworkTransport {
    // HTTP client with security configuration
    http_client: Client,
    
    // Automatic observability
    automatic_instrumentation: AutomaticInstrumentation,
    
    // Network security manager
    security_manager: NetworkSecurityManager,
    
    // Request/response interceptors
    request_interceptors: Arc<RwLock<Vec<Box<dyn RequestInterceptor>>>>,
    response_interceptors: Arc<RwLock<Vec<Box<dyn ResponseInterceptor>>>>,
    
    // Response caching for performance
    response_cache: ResponseCache,
    
    // Network policies
    network_policies: Arc<RwLock<HashMap<String, NetworkPolicy>>>,
    
    // Performance tracking
    request_metrics: Arc<RwLock<HashMap<String, RequestMetrics>>>,
    
    // Enterprise features
    license_manager: Arc<LicenseManager>,
    
    // Circuit breaker for external services
    circuit_breakers: Arc<RwLock<HashMap<String, NetworkCircuitBreaker>>>,
}

/// Network request with security and observability metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureRequest {
    pub request_id: Uuid,
    pub url: String,
    pub method: HttpMethod,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub classification: ClassificationLevel,
    pub user_id: String,
    pub session_id: Uuid,
    pub timeout_ms: Option<u64>,
    pub retry_policy: Option<RetryPolicy>,
    pub cache_policy: Option<CachePolicy>,
    pub security_requirements: SecurityRequirements,
}

/// HTTP methods for network requests
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

/// Secure response with audit metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureResponse {
    pub request_id: Uuid,
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub response_time_ms: u64,
    pub cached: bool,
    pub security_validated: bool,
    pub observability_metadata: NetworkObservabilityMetadata,
}

/// Network observability metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkObservabilityMetadata {
    pub operation_id: String,
    pub dns_resolution_time_ms: u64,
    pub tcp_connection_time_ms: u64,
    pub tls_handshake_time_ms: u64,
    pub request_time_ms: u64,
    pub response_time_ms: u64,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub interceptors_executed: Vec<String>,
}

/// Network security requirements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityRequirements {
    pub require_tls: bool,
    pub min_tls_version: Option<String>,
    pub certificate_validation: CertificateValidation,
    pub allowed_domains: Option<Vec<String>>,
    pub blocked_domains: Option<Vec<String>>,
    pub require_authentication: bool,
    pub max_response_size_bytes: Option<u64>,
    pub content_type_validation: Option<Vec<String>>,
}

/// Certificate validation policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CertificateValidation {
    Strict,      // Full certificate chain validation
    Permissive,  // Allow self-signed certificates
    Custom,      // Custom certificate validation logic
}

/// Network policy for endpoint security
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPolicy {
    pub policy_id: String,
    pub endpoint_pattern: String,
    pub allowed_methods: Vec<HttpMethod>,
    pub security_requirements: SecurityRequirements,
    pub rate_limits: Option<RateLimit>,
    pub audit_level: AuditLevel,
    pub data_classification: ClassificationLevel,
}

/// Network audit levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditLevel {
    None,        // No audit logging
    Basic,       // Request/response metadata only
    Full,        // Full request/response including body
    Headers,     // Headers and metadata only
}

/// Rate limiting for network endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimit {
    pub requests_per_minute: u32,
    pub burst_limit: u32,
    pub window_size_seconds: u64,
}

/// Retry policy for network requests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
    pub retry_on_status: Vec<u16>,
    pub retry_on_timeout: bool,
}

/// Cache policy for response caching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachePolicy {
    pub cache_key: Option<String>,
    pub ttl_seconds: u64,
    pub vary_on_headers: Vec<String>,
    pub cache_on_status: Vec<u16>,
    pub respect_cache_headers: bool,
}

/// Request metrics for performance monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RequestMetrics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub avg_response_time_ms: f64,
    pub p95_response_time_ms: f64,
    pub p99_response_time_ms: f64,
    pub bytes_transferred: u64,
    pub cache_hit_ratio: f64,
}

/// Circuit breaker for network endpoints
#[derive(Debug, Clone)]
struct NetworkCircuitBreaker {
    pub endpoint_pattern: String,
    pub failure_threshold: u32,
    pub timeout_seconds: u64,
    pub current_failures: u32,
    pub state: CircuitBreakerState,
    pub last_failure_time: Option<Instant>,
}

/// Circuit breaker states
#[derive(Debug, Clone, PartialEq)]
enum CircuitBreakerState {
    Closed,
    Open,
    HalfOpen,
}

/// Request interceptor trait for middleware
#[async_trait::async_trait]
pub trait RequestInterceptor: Send + Sync {
    /// Intercept request before sending
    async fn intercept_request(
        &self,
        request: &mut SecureRequest,
        context: &NetworkContext,
    ) -> Result<(), NetworkError>;
    
    /// Get interceptor name
    fn name(&self) -> &str;
    
    /// Get interceptor priority
    fn priority(&self) -> u32 {
        100
    }
}

/// Response interceptor trait for middleware
#[async_trait::async_trait]
pub trait ResponseInterceptor: Send + Sync {
    /// Intercept response after receiving
    async fn intercept_response(
        &self,
        response: &mut SecureResponse,
        request: &SecureRequest,
        context: &NetworkContext,
    ) -> Result<(), NetworkError>;
    
    /// Get interceptor name
    fn name(&self) -> &str;
    
    /// Get interceptor priority
    fn priority(&self) -> u32 {
        100
    }
}

/// Network context for request execution
#[derive(Debug, Clone)]
pub struct NetworkContext {
    pub user_id: String,
    pub session_id: Uuid,
    pub security_label: SecurityLabel,
    pub tenant_id: Option<String>,
    pub source_ip: Option<String>,
    pub user_agent: Option<String>,
}

impl SecureNetworkTransport {
    /// Create new secure network transport
    pub async fn new(license_manager: Arc<LicenseManager>) -> Result<Self, NetworkError> {
        // Configure HTTP client with security settings
        let http_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .danger_accept_invalid_certs(false) // Always validate certificates
            .tcp_keepalive(Duration::from_secs(60))
            .pool_max_idle_per_host(10)
            .build()
            .map_err(|e| NetworkError::ClientConfigurationError(e.to_string()))?;

        Ok(Self {
            http_client,
            automatic_instrumentation: AutomaticInstrumentation::new(license_manager.clone()),
            security_manager: NetworkSecurityManager::new(),
            request_interceptors: Arc::new(RwLock::new(Vec::new())),
            response_interceptors: Arc::new(RwLock::new(Vec::new())),
            response_cache: ResponseCache::new(1000), // 1000 entry cache
            network_policies: Arc::new(RwLock::new(HashMap::new())),
            request_metrics: Arc::new(RwLock::new(HashMap::new())),
            license_manager,
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    /// Execute secure HTTP request with automatic observability (main method)
    pub async fn request(
        &self,
        request: SecureRequest,
        context: NetworkContext,
        app_state: &AppState,
    ) -> Result<SecureResponse, NetworkError> {
        let start_time = Instant::now();

        // Create observability context
        let obs_context = ObservabilityContext::new(
            "network_transport",
            &format!("{} {}", request.method.as_str(), request.url),
            request.classification.clone(),
            &context.user_id,
            context.session_id,
        );

        // Execute with automatic observability
        let result = self.automatic_instrumentation.instrument_operation(
            &obs_context,
            async {
                self.execute_secure_request(request, context).await
            },
            app_state,
        ).await;

        // Update request metrics
        let duration = start_time.elapsed();
        self.update_request_metrics(&obs_context.operation, duration, result.is_ok()).await;

        result
    }

    /// Execute secure request with all security and observability features
    async fn execute_secure_request(
        &self,
        mut request: SecureRequest,
        context: NetworkContext,
    ) -> Result<SecureResponse, NetworkError> {
        // Validate network policy
        self.validate_network_policy(&request).await?;

        // Check circuit breaker
        if self.is_circuit_breaker_open(&request.url).await {
            return Err(NetworkError::CircuitBreakerOpen(request.url.clone()));
        }

        // Check cache first
        if let Some(cached_response) = self.check_cache(&request).await? {
            return Ok(cached_response);
        }

        // Execute request interceptors
        self.execute_request_interceptors(&mut request, &context).await?;

        // Validate security requirements
        self.security_manager.validate_request(&request).await?;

        // Execute HTTP request with retries
        let response = self.execute_with_retries(&request, &context).await?;

        // Execute response interceptors
        let mut secure_response = self.convert_to_secure_response(response, &request).await?;
        self.execute_response_interceptors(&mut secure_response, &request, &context).await?;

        // Cache response if appropriate
        self.cache_response(&request, &secure_response).await?;

        // Update circuit breaker
        self.update_circuit_breaker(&request.url, true).await;

        Ok(secure_response)
    }

    /// Execute HTTP request with retry logic
    async fn execute_with_retries(
        &self,
        request: &SecureRequest,
        _context: &NetworkContext,
    ) -> Result<Response, NetworkError> {
        let retry_policy = request.retry_policy.clone().unwrap_or_default();
        let mut attempt = 0;

        loop {
            attempt += 1;

            // Build HTTP request
            let mut http_request = self.http_client
                .request(request.method.to_reqwest_method(), &request.url);

            // Add headers
            for (key, value) in &request.headers {
                http_request = http_request.header(key, value);
            }

            // Add body if present
            if let Some(body) = &request.body {
                http_request = http_request.body(body.clone());
            }

            // Set timeout
            if let Some(timeout_ms) = request.timeout_ms {
                http_request = http_request.timeout(Duration::from_millis(timeout_ms));
            }

            // Execute request
            match http_request.send().await {
                Ok(response) => {
                    let status = response.status().as_u16();
                    
                    // Check if response indicates success
                    if status < 500 && !retry_policy.retry_on_status.contains(&status) {
                        return Ok(response);
                    }

                    // Check if we should retry
                    if attempt >= retry_policy.max_attempts {
                        return Err(NetworkError::HttpError(status, "Max retries exceeded".to_string()));
                    }

                    // Calculate delay and retry
                    let delay = self.calculate_retry_delay(attempt, &retry_policy);
                    tokio::time::sleep(delay).await;
                },
                Err(error) => {
                    // Check if error is retriable
                    if attempt >= retry_policy.max_attempts || !self.is_retriable_error(&error) {
                        return Err(NetworkError::RequestError(error.to_string()));
                    }

                    // Calculate delay and retry
                    let delay = self.calculate_retry_delay(attempt, &retry_policy);
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    /// Validate network policy for request
    async fn validate_network_policy(&self, request: &SecureRequest) -> Result<(), NetworkError> {
        let policies = self.network_policies.read().await;
        
        for policy in policies.values() {
            if self.matches_endpoint_pattern(&request.url, &policy.endpoint_pattern) {
                // Check allowed methods
                if !policy.allowed_methods.contains(&request.method) {
                    return Err(NetworkError::PolicyViolation(
                        format!("Method {} not allowed for endpoint {}", 
                            request.method.as_str(), request.url)
                    ));
                }

                // Check security requirements
                if policy.security_requirements.require_tls && !request.url.starts_with("https://") {
                    return Err(NetworkError::SecurityViolation(
                        "HTTPS required but request uses HTTP".to_string()
                    ));
                }

                // Check domain restrictions
                if let Some(allowed_domains) = &policy.security_requirements.allowed_domains {
                    let domain = self.extract_domain(&request.url)?;
                    if !allowed_domains.iter().any(|allowed| domain.contains(allowed)) {
                        return Err(NetworkError::SecurityViolation(
                            format!("Domain {} not in allowed list", domain)
                        ));
                    }
                }

                if let Some(blocked_domains) = &policy.security_requirements.blocked_domains {
                    let domain = self.extract_domain(&request.url)?;
                    if blocked_domains.iter().any(|blocked| domain.contains(blocked)) {
                        return Err(NetworkError::SecurityViolation(
                            format!("Domain {} is blocked", domain)
                        ));
                    }
                }

                break;
            }
        }

        Ok(())
    }

    /// Add request interceptor
    pub async fn add_request_interceptor<I>(&self, interceptor: I)
    where
        I: RequestInterceptor + 'static,
    {
        let mut interceptors = self.request_interceptors.write().await;
        interceptors.push(Box::new(interceptor));
        interceptors.sort_by_key(|i| i.priority());
    }

    /// Add response interceptor  
    pub async fn add_response_interceptor<I>(&self, interceptor: I)
    where
        I: ResponseInterceptor + 'static,
    {
        let mut interceptors = self.response_interceptors.write().await;
        interceptors.push(Box::new(interceptor));
        interceptors.sort_by_key(|i| i.priority());
    }

    /// Set network policy for endpoint pattern
    pub async fn set_network_policy(&self, policy: NetworkPolicy) {
        let mut policies = self.network_policies.write().await;
        policies.insert(policy.endpoint_pattern.clone(), policy);
    }

    /// Get network metrics for monitoring
    pub async fn get_network_metrics(&self) -> HashMap<String, RequestMetrics> {
        self.request_metrics.read().await.clone()
    }

    /// Get circuit breaker status
    pub async fn get_circuit_breaker_status(&self) -> HashMap<String, CircuitBreakerState> {
        let breakers = self.circuit_breakers.read().await;
        breakers.iter()
            .map(|(url, breaker)| (url.clone(), breaker.state.clone()))
            .collect()
    }

    // Helper methods

    async fn execute_request_interceptors(
        &self,
        request: &mut SecureRequest,
        context: &NetworkContext,
    ) -> Result<(), NetworkError> {
        let interceptors = self.request_interceptors.read().await;
        for interceptor in interceptors.iter() {
            interceptor.intercept_request(request, context).await?;
        }
        Ok(())
    }

    async fn execute_response_interceptors(
        &self,
        response: &mut SecureResponse,
        request: &SecureRequest,
        context: &NetworkContext,
    ) -> Result<(), NetworkError> {
        let interceptors = self.response_interceptors.read().await;
        for interceptor in interceptors.iter() {
            interceptor.intercept_response(response, request, context).await?;
        }
        Ok(())
    }

    async fn check_cache(&self, request: &SecureRequest) -> Result<Option<SecureResponse>, NetworkError> {
        if let Some(cache_policy) = &request.cache_policy {
            let cache_key = cache_policy.cache_key.clone()
                .unwrap_or_else(|| format!("{}:{}", request.method.as_str(), request.url));
            
            if let Some(cached) = self.response_cache.get(&cache_key).await {
                return Ok(Some(cached));
            }
        }
        Ok(None)
    }

    async fn cache_response(
        &self,
        request: &SecureRequest,
        response: &SecureResponse,
    ) -> Result<(), NetworkError> {
        if let Some(cache_policy) = &request.cache_policy {
            if cache_policy.cache_on_status.contains(&response.status_code) {
                let cache_key = cache_policy.cache_key.clone()
                    .unwrap_or_else(|| format!("{}:{}", request.method.as_str(), request.url));
                
                self.response_cache.set(
                    cache_key,
                    response.clone(),
                    Duration::from_secs(cache_policy.ttl_seconds),
                ).await;
            }
        }
        Ok(())
    }

    async fn convert_to_secure_response(
        &self,
        response: Response,
        request: &SecureRequest,
    ) -> Result<SecureResponse, NetworkError> {
        let status_code = response.status().as_u16();
        
        // Extract headers
        let mut headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(key.to_string(), value_str.to_string());
            }
        }

        // Read body
        let body = response.bytes().await
            .map_err(|e| NetworkError::ResponseError(e.to_string()))?
            .to_vec();

        Ok(SecureResponse {
            request_id: request.request_id,
            status_code,
            headers,
            body: Some(body),
            response_time_ms: 0, // Will be calculated by caller
            cached: false,
            security_validated: true,
            observability_metadata: NetworkObservabilityMetadata {
                operation_id: request.request_id.to_string(),
                dns_resolution_time_ms: 0,
                tcp_connection_time_ms: 0,
                tls_handshake_time_ms: 0,
                request_time_ms: 0,
                response_time_ms: 0,
                bytes_sent: request.body.as_ref().map(|b| b.len()).unwrap_or(0) as u64,
                bytes_received: body.len() as u64,
                interceptors_executed: Vec::new(),
            },
        })
    }

    async fn update_request_metrics(
        &self,
        endpoint: &str,
        duration: Duration,
        success: bool,
    ) {
        let mut metrics = self.request_metrics.write().await;
        let metric = metrics.entry(endpoint.to_string()).or_insert(RequestMetrics {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            avg_response_time_ms: 0.0,
            p95_response_time_ms: 0.0,
            p99_response_time_ms: 0.0,
            bytes_transferred: 0,
            cache_hit_ratio: 0.0,
        });

        metric.total_requests += 1;
        if success {
            metric.successful_requests += 1;
        } else {
            metric.failed_requests += 1;
        }

        let duration_ms = duration.as_millis() as f64;
        metric.avg_response_time_ms = (metric.avg_response_time_ms + duration_ms) / 2.0;
        metric.p95_response_time_ms = metric.p95_response_time_ms.max(duration_ms);
        metric.p99_response_time_ms = metric.p99_response_time_ms.max(duration_ms);
    }

    async fn is_circuit_breaker_open(&self, url: &str) -> bool {
        let breakers = self.circuit_breakers.read().await;
        if let Some(breaker) = breakers.get(url) {
            breaker.state == CircuitBreakerState::Open
        } else {
            false
        }
    }

    async fn update_circuit_breaker(&self, url: &str, success: bool) {
        let mut breakers = self.circuit_breakers.write().await;
        let breaker = breakers.entry(url.to_string()).or_insert(NetworkCircuitBreaker {
            endpoint_pattern: url.to_string(),
            failure_threshold: 5,
            timeout_seconds: 60,
            current_failures: 0,
            state: CircuitBreakerState::Closed,
            last_failure_time: None,
        });

        if success {
            breaker.current_failures = 0;
            if breaker.state == CircuitBreakerState::HalfOpen {
                breaker.state = CircuitBreakerState::Closed;
            }
        } else {
            breaker.current_failures += 1;
            breaker.last_failure_time = Some(Instant::now());
            
            if breaker.current_failures >= breaker.failure_threshold {
                breaker.state = CircuitBreakerState::Open;
            }
        }
    }

    fn matches_endpoint_pattern(&self, url: &str, pattern: &str) -> bool {
        // Simple pattern matching (in production, use regex)
        url.contains(pattern) || pattern == "*"
    }

    fn extract_domain(&self, url: &str) -> Result<String, NetworkError> {
        url::Url::parse(url)
            .map_err(|e| NetworkError::InvalidUrl(e.to_string()))?
            .host_str()
            .map(|s| s.to_string())
            .ok_or_else(|| NetworkError::InvalidUrl("No host in URL".to_string()))
    }

    fn is_retriable_error(&self, error: &reqwest::Error) -> bool {
        error.is_timeout() || error.is_connect() || error.is_request()
    }

    fn calculate_retry_delay(&self, attempt: u32, retry_policy: &RetryPolicy) -> Duration {
        let delay_ms = (retry_policy.base_delay_ms as f64 * 
            retry_policy.backoff_multiplier.powi(attempt as i32 - 1)) as u64;
        
        let capped_delay = delay_ms.min(retry_policy.max_delay_ms);
        Duration::from_millis(capped_delay)
    }
}

impl HttpMethod {
    fn as_str(&self) -> &str {
        match self {
            HttpMethod::GET => "GET",
            HttpMethod::POST => "POST",
            HttpMethod::PUT => "PUT",
            HttpMethod::DELETE => "DELETE",
            HttpMethod::PATCH => "PATCH",
            HttpMethod::HEAD => "HEAD",
            HttpMethod::OPTIONS => "OPTIONS",
        }
    }

    fn to_reqwest_method(&self) -> reqwest::Method {
        match self {
            HttpMethod::GET => reqwest::Method::GET,
            HttpMethod::POST => reqwest::Method::POST,
            HttpMethod::PUT => reqwest::Method::PUT,
            HttpMethod::DELETE => reqwest::Method::DELETE,
            HttpMethod::PATCH => reqwest::Method::PATCH,
            HttpMethod::HEAD => reqwest::Method::HEAD,
            HttpMethod::OPTIONS => reqwest::Method::OPTIONS,
        }
    }
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
            retry_on_status: vec![500, 502, 503, 504],
            retry_on_timeout: true,
        }
    }
}

impl Default for SecurityRequirements {
    fn default() -> Self {
        Self {
            require_tls: true,
            min_tls_version: Some("1.2".to_string()),
            certificate_validation: CertificateValidation::Strict,
            allowed_domains: None,
            blocked_domains: None,
            require_authentication: false,
            max_response_size_bytes: Some(10 * 1024 * 1024), // 10MB default
            content_type_validation: None,
        }
    }
}

/// Network transport errors
#[derive(Debug, thiserror::Error)]
pub enum NetworkError {
    #[error("Client configuration error: {0}")]
    ClientConfigurationError(String),
    
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    
    #[error("HTTP error {0}: {1}")]
    HttpError(u16, String),
    
    #[error("Request error: {0}")]
    RequestError(String),
    
    #[error("Response error: {0}")]
    ResponseError(String),
    
    #[error("Security violation: {0}")]
    SecurityViolation(String),
    
    #[error("Policy violation: {0}")]
    PolicyViolation(String),
    
    #[error("Circuit breaker open for: {0}")]
    CircuitBreakerOpen(String),
    
    #[error("Cache error: {0}")]
    CacheError(String),
    
    #[error("Interceptor error: {0}")]
    InterceptorError(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::LicenseManager;

    #[tokio::test]
    async fn test_secure_network_transport_creation() {
        let license_manager = Arc::new(LicenseManager::new().await.unwrap());
        let transport = SecureNetworkTransport::new(license_manager).await;
        
        assert!(transport.is_ok());
    }

    #[test]
    fn test_http_method_conversion() {
        assert_eq!(HttpMethod::GET.as_str(), "GET");
        assert_eq!(HttpMethod::POST.as_str(), "POST");
    }

    #[test]
    fn test_security_requirements_default() {
        let requirements = SecurityRequirements::default();
        assert!(requirements.require_tls);
        assert_eq!(requirements.certificate_validation, CertificateValidation::Strict);
    }

    #[test]
    fn test_retry_policy_default() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.max_attempts, 3);
        assert_eq!(policy.base_delay_ms, 1000);
        assert!(policy.retry_on_status.contains(&500));
    }
}
