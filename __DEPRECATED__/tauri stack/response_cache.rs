// src-tauri/src/networking/response_cache.rs
// Response Cache - High-Performance Caching for Network Responses
// Provides enterprise-grade caching with TTL, size limits, and invalidation

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use lru::LruCache;
use std::num::NonZeroUsize;

use super::{SecureResponse, CachePolicy};
use crate::security::ClassificationLevel;

/// High-performance response cache with enterprise features
#[derive(Debug)]
pub struct ResponseCache {
    // LRU cache for response data
    cache: Arc<RwLock<LruCache<String, CachedResponse>>>,
    
    // Cache metadata for management
    cache_metadata: Arc<RwLock<HashMap<String, CacheMetadata>>>,
    
    // Cache configuration
    config: CacheConfig,
    
    // Cache statistics
    stats: Arc<RwLock<CacheStats>>,
}

/// Cached response with metadata
#[derive(Debug, Clone)]
struct CachedResponse {
    pub response: SecureResponse,
    pub cached_at: Instant,
    pub ttl: Duration,
    pub classification: ClassificationLevel,
    pub access_count: u64,
    pub size_bytes: usize,
}

/// Cache metadata for enterprise features
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheMetadata {
    pub key: String,
    pub classification: ClassificationLevel,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_accessed: chrono::DateTime<chrono::Utc>,
    pub access_count: u64,
    pub size_bytes: usize,
    pub ttl_seconds: u64,
    pub tags: HashMap<String, String>,
}

/// Cache configuration
#[derive(Debug, Clone)]
struct CacheConfig {
    pub max_entries: usize,
    pub max_memory_mb: usize,
    pub default_ttl_seconds: u64,
    pub enable_compression: bool,
    pub respect_cache_control: bool,
    pub cache_classification_limit: ClassificationLevel,
}

/// Cache statistics for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_requests: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub cache_size: usize,
    pub memory_usage_bytes: usize,
    pub evictions: u64,
    pub hit_ratio: f64,
    pub avg_response_size: f64,
}

impl ResponseCache {
    /// Create new response cache
    pub fn new(max_entries: usize) -> Self {
        let cache_size = NonZeroUsize::new(max_entries).unwrap_or(NonZeroUsize::new(1000).unwrap());
        
        Self {
            cache: Arc::new(RwLock::new(LruCache::new(cache_size))),
            cache_metadata: Arc::new(RwLock::new(HashMap::new())),
            config: CacheConfig {
                max_entries,
                max_memory_mb: 100, // 100MB default
                default_ttl_seconds: 300, // 5 minutes
                enable_compression: true,
                respect_cache_control: true,
                cache_classification_limit: ClassificationLevel::Internal,
            },
            stats: Arc::new(RwLock::new(CacheStats::default())),
        }
    }

    /// Get cached response
    pub async fn get(&self, key: &str) -> Option<SecureResponse> {
        let mut stats = self.stats.write().await;
        stats.total_requests += 1;

        let mut cache = self.cache.write().await;
        
        if let Some(cached) = cache.get_mut(key) {
            // Check if cache entry is still valid
            if cached.cached_at.elapsed() < cached.ttl {
                // Update access statistics
                cached.access_count += 1;
                stats.cache_hits += 1;
                stats.hit_ratio = stats.cache_hits as f64 / stats.total_requests as f64;
                
                // Update metadata
                self.update_access_metadata(key).await;
                
                // Return cloned response with updated cache flag
                let mut response = cached.response.clone();
                response.cached = true;
                return Some(response);
            } else {
                // Entry expired, remove it
                cache.pop(key);
                self.remove_metadata(key).await;
            }
        }

        stats.cache_misses += 1;
        stats.hit_ratio = stats.cache_hits as f64 / stats.total_requests as f64;
        None
    }

    /// Set cached response
    pub async fn set(&self, key: String, response: SecureResponse, ttl: Duration) {
        // Check if response should be cached based on classification
        if response.status_code >= 400 {
            return; // Don't cache error responses
        }

        // Calculate response size
        let size_bytes = self.calculate_response_size(&response);
        
        // Check memory limits
        if !self.check_memory_limits(size_bytes).await {
            return; // Skip caching if memory limit would be exceeded
        }

        let cached_response = CachedResponse {
            response: response.clone(),
            cached_at: Instant::now(),
            ttl,
            classification: ClassificationLevel::Internal, // Should be determined from response
            access_count: 0,
            size_bytes,
        };

        // Add to cache
        let mut cache = self.cache.write().await;
        let evicted = cache.put(key.clone(), cached_response).is_some();
        
        if evicted {
            let mut stats = self.stats.write().await;
            stats.evictions += 1;
        }

        // Update metadata
        self.set_metadata(key, &response, ttl, size_bytes).await;
        
        // Update statistics
        self.update_cache_stats().await;
    }

    /// Invalidate cache entry
    pub async fn invalidate(&self, key: &str) -> bool {
        let mut cache = self.cache.write().await;
        let removed = cache.pop(key).is_some();
        
        if removed {
            self.remove_metadata(key).await;
            self.update_cache_stats().await;
        }
        
        removed
    }

    /// Invalidate cache entries by pattern
    pub async fn invalidate_pattern(&self, pattern: &str) -> u32 {
        let mut invalidated = 0;
        let keys_to_remove: Vec<String>;
        
        // Collect keys that match pattern
        {
            let cache = self.cache.read().await;
            keys_to_remove = cache.iter()
                .filter_map(|(key, _)| {
                    if key.contains(pattern) {
                        Some(key.clone())
                    } else {
                        None
                    }
                })
                .collect();
        }
        
        // Remove matching entries
        for key in keys_to_remove {
            if self.invalidate(&key).await {
                invalidated += 1;
            }
        }
        
        invalidated
    }

    /// Clear all cache entries
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
        
        let mut metadata = self.cache_metadata.write().await;
        metadata.clear();
        
        self.reset_stats().await;
    }

    /// Get cache statistics
    pub async fn get_stats(&self) -> CacheStats {
        self.stats.read().await.clone()
    }

    /// Get cache metadata for enterprise monitoring
    pub async fn get_metadata(&self) -> Vec<CacheMetadata> {
        let metadata = self.cache_metadata.read().await;
        metadata.values().cloned().collect()
    }

    /// Set cache configuration
    pub async fn configure(&mut self, config: CacheConfig) {
        self.config = config;
        
        // If max_entries changed, recreate cache
        if let Ok(new_size) = NonZeroUsize::try_from(self.config.max_entries) {
            let mut cache = self.cache.write().await;
            let old_cache = std::mem::replace(&mut *cache, LruCache::new(new_size));
            
            // Transfer entries up to new limit
            for (key, value) in old_cache.into_iter().take(self.config.max_entries) {
                cache.put(key, value);
            }
        }
    }

    /// Check if response should be cached based on cache policy
    pub fn should_cache(&self, response: &SecureResponse, cache_policy: Option<&CachePolicy>) -> bool {
        // Check status code
        if response.status_code >= 400 {
            return false;
        }

        // Check cache policy if provided
        if let Some(policy) = cache_policy {
            if !policy.cache_on_status.contains(&response.status_code) {
                return false;
            }
        }

        // Check cache-control headers if configured
        if self.config.respect_cache_control {
            if let Some(cache_control) = response.headers.get("cache-control") {
                if cache_control.contains("no-cache") || cache_control.contains("no-store") {
                    return false;
                }
            }
        }

        true
    }

    /// Get cache key for request
    pub fn generate_cache_key(
        &self,
        method: &str,
        url: &str,
        headers: &HashMap<String, String>,
        vary_on_headers: &[String],
    ) -> String {
        let mut key = format!("{}:{}", method, url);
        
        // Add vary headers to key
        for header_name in vary_on_headers {
            if let Some(header_value) = headers.get(header_name) {
                key.push_str(&format!("&{}={}", header_name, header_value));
            }
        }
        
        key
    }

    /// Cleanup expired entries
    pub async fn cleanup_expired(&self) -> u32 {
        let mut removed = 0;
        let keys_to_remove: Vec<String>;
        
        // Collect expired keys
        {
            let cache = self.cache.read().await;
            keys_to_remove = cache.iter()
                .filter_map(|(key, cached)| {
                    if cached.cached_at.elapsed() >= cached.ttl {
                        Some(key.clone())
                    } else {
                        None
                    }
                })
                .collect();
        }
        
        // Remove expired entries
        for key in keys_to_remove {
            if self.invalidate(&key).await {
                removed += 1;
            }
        }
        
        removed
    }

    /// Export cache contents for debugging/analysis
    pub async fn export_cache(&self) -> Vec<CacheExportEntry> {
        let cache = self.cache.read().await;
        let metadata = self.cache_metadata.read().await;
        
        cache.iter()
            .map(|(key, cached)| {
                let meta = metadata.get(key);
                CacheExportEntry {
                    key: key.clone(),
                    url: cached.response.headers.get("x-original-url")
                        .cloned()
                        .unwrap_or_else(|| "unknown".to_string()),
                    status_code: cached.response.status_code,
                    size_bytes: cached.size_bytes,
                    cached_at: cached.cached_at,
                    ttl_seconds: cached.ttl.as_secs(),
                    access_count: cached.access_count,
                    classification: cached.classification.clone(),
                    tags: meta.map(|m| m.tags.clone()).unwrap_or_default(),
                }
            })
            .collect()
    }

    // Private helper methods

    async fn update_access_metadata(&self, key: &str) {
        let mut metadata = self.cache_metadata.write().await;
        if let Some(meta) = metadata.get_mut(key) {
            meta.last_accessed = chrono::Utc::now();
            meta.access_count += 1;
        }
    }

    async fn set_metadata(
        &self,
        key: String,
        response: &SecureResponse,
        ttl: Duration,
        size_bytes: usize,
    ) {
        let metadata = CacheMetadata {
            key: key.clone(),
            classification: ClassificationLevel::Internal, // Should be determined from response
            created_at: chrono::Utc::now(),
            last_accessed: chrono::Utc::now(),
            access_count: 0,
            size_bytes,
            ttl_seconds: ttl.as_secs(),
            tags: HashMap::new(),
        };
        
        let mut metadata_map = self.cache_metadata.write().await;
        metadata_map.insert(key, metadata);
    }

    async fn remove_metadata(&self, key: &str) {
        let mut metadata = self.cache_metadata.write().await;
        metadata.remove(key);
    }

    async fn check_memory_limits(&self, additional_bytes: usize) -> bool {
        let stats = self.stats.read().await;
        let new_memory_usage = stats.memory_usage_bytes + additional_bytes;
        let max_memory_bytes = self.config.max_memory_mb * 1024 * 1024;
        
        new_memory_usage <= max_memory_bytes
    }

    fn calculate_response_size(&self, response: &SecureResponse) -> usize {
        let headers_size: usize = response.headers.iter()
            .map(|(k, v)| k.len() + v.len())
            .sum();
        
        let body_size = response.body.as_ref().map(|b| b.len()).unwrap_or(0);
        
        headers_size + body_size + std::mem::size_of::<SecureResponse>()
    }

    async fn update_cache_stats(&self) {
        let cache = self.cache.read().await;
        let mut stats = self.stats.write().await;
        
        stats.cache_size = cache.len();
        
        // Calculate memory usage
        let mut total_memory = 0;
        let mut total_response_size = 0;
        let mut response_count = 0;
        
        for cached in cache.iter() {
            total_memory += cached.1.size_bytes;
            total_response_size += cached.1.size_bytes;
            response_count += 1;
        }
        
        stats.memory_usage_bytes = total_memory;
        if response_count > 0 {
            stats.avg_response_size = total_response_size as f64 / response_count as f64;
        }
    }

    async fn reset_stats(&self) {
        let mut stats = self.stats.write().await;
        *stats = CacheStats::default();
    }
}

/// Cache export entry for analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheExportEntry {
    pub key: String,
    pub url: String,
    pub status_code: u16,
    pub size_bytes: usize,
    pub cached_at: Instant,
    pub ttl_seconds: u64,
    pub access_count: u64,
    pub classification: ClassificationLevel,
    pub tags: HashMap<String, String>,
}

impl Default for CacheStats {
    fn default() -> Self {
        Self {
            total_requests: 0,
            cache_hits: 0,
            cache_misses: 0,
            cache_size: 0,
            memory_usage_bytes: 0,
            evictions: 0,
            hit_ratio: 0.0,
            avg_response_size: 0.0,
        }
    }
}

/// Cache cleanup task for automatic maintenance
pub struct CacheCleanupTask {
    cache: Arc<ResponseCache>,
    cleanup_interval: Duration,
}

impl CacheCleanupTask {
    /// Create new cleanup task
    pub fn new(cache: Arc<ResponseCache>, cleanup_interval: Duration) -> Self {
        Self {
            cache,
            cleanup_interval,
        }
    }

    /// Start background cleanup task
    pub async fn start(self) {
        let mut interval = tokio::time::interval(self.cleanup_interval);
        
        loop {
            interval.tick().await;
            
            let removed = self.cache.cleanup_expired().await;
            if removed > 0 {
                tracing::debug!("Cache cleanup removed {} expired entries", removed);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_cache_set_and_get() {
        let cache = ResponseCache::new(100);
        
        let response = SecureResponse {
            request_id: uuid::Uuid::new_v4(),
            status_code: 200,
            headers: HashMap::new(),
            body: Some(b"test response".to_vec()),
            response_time_ms: 100,
            cached: false,
            security_validated: true,
            observability_metadata: crate::networking::NetworkObservabilityMetadata {
                operation_id: "test".to_string(),
                dns_resolution_time_ms: 0,
                tcp_connection_time_ms: 0,
                tls_handshake_time_ms: 0,
                request_time_ms: 0,
                response_time_ms: 0,
                bytes_sent: 0,
                bytes_received: 13,
                interceptors_executed: Vec::new(),
            },
        };
        
        cache.set("test_key".to_string(), response, Duration::from_secs(300)).await;
        
        let cached_response = cache.get("test_key").await;
        assert!(cached_response.is_some());
        assert!(cached_response.unwrap().cached);
    }

    #[tokio::test]
    async fn test_cache_expiration() {
        let cache = ResponseCache::new(100);
        
        let response = SecureResponse {
            request_id: uuid::Uuid::new_v4(),
            status_code: 200,
            headers: HashMap::new(),
            body: Some(b"test response".to_vec()),
            response_time_ms: 100,
            cached: false,
            security_validated: true,
            observability_metadata: crate::networking::NetworkObservabilityMetadata {
                operation_id: "test".to_string(),
                dns_resolution_time_ms: 0,
                tcp_connection_time_ms: 0,
                tls_handshake_time_ms: 0,
                request_time_ms: 0,
                response_time_ms: 0,
                bytes_sent: 0,
                bytes_received: 13,
                interceptors_executed: Vec::new(),
            },
        };
        
        // Set with very short TTL
        cache.set("test_key".to_string(), response, Duration::from_millis(1)).await;
        
        // Wait for expiration
        tokio::time::sleep(Duration::from_millis(10)).await;
        
        let cached_response = cache.get("test_key").await;
        assert!(cached_response.is_none());
    }

    #[tokio::test]
    async fn test_cache_invalidation() {
        let cache = ResponseCache::new(100);
        
        let response = SecureResponse {
            request_id: uuid::Uuid::new_v4(),
            status_code: 200,
            headers: HashMap::new(),
            body: Some(b"test response".to_vec()),
            response_time_ms: 100,
            cached: false,
            security_validated: true,
            observability_metadata: crate::networking::NetworkObservabilityMetadata {
                operation_id: "test".to_string(),
                dns_resolution_time_ms: 0,
                tcp_connection_time_ms: 0,
                tls_handshake_time_ms: 0,
                request_time_ms: 0,
                response_time_ms: 0,
                bytes_sent: 0,
                bytes_received: 13,
                interceptors_executed: Vec::new(),
            },
        };
        
        cache.set("test_key".to_string(), response, Duration::from_secs(300)).await;
        
        let invalidated = cache.invalidate("test_key").await;
        assert!(invalidated);
        
        let cached_response = cache.get("test_key").await;
        assert!(cached_response.is_none());
    }

    #[tokio::test]
    async fn test_cache_stats() {
        let cache = ResponseCache::new(100);
        
        // Initial stats should be zero
        let stats = cache.get_stats().await;
        assert_eq!(stats.total_requests, 0);
        assert_eq!(stats.cache_hits, 0);
        
        // Make a cache miss
        let _ = cache.get("nonexistent").await;
        
        let stats = cache.get_stats().await;
        assert_eq!(stats.total_requests, 1);
        assert_eq!(stats.cache_misses, 1);
        assert_eq!(stats.hit_ratio, 0.0);
    }
}
