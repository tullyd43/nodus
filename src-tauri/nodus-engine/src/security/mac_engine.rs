// src-tauri/src/security/mac_engine.rs
// MAC Engine Implementation - Replaces MACEngine.js
// Bell-LaPadula "No Read Up, No Write Down" enforcement

use super::{ClassificationLevel, SecurityLabel, SecurityError, MACOperation, constant_time};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::RwLock;
use lru::LruCache;
use std::num::NonZeroUsize;

/// MAC decision cache entry
#[derive(Debug, Clone)]
struct MACDecision {
    allowed: bool,
    timestamp: chrono::DateTime<chrono::Utc>,
}

/// MAC Engine for Bell-LaPadula enforcement (replaces your JS MACEngine)
pub struct MACEngine {
    // LRU cache for MAC decisions (replaces JS Map cache)
    cache: RwLock<LruCache<String, MACDecision>>,
}

impl MACEngine {
    /// Create new MAC engine with bounded cache (replaces JS constructor)
    pub fn new() -> Self {
        Self {
            cache: RwLock::new(LruCache::new(NonZeroUsize::new(1024).unwrap())),
        }
    }

    /// Check read access under "No Read Up" rule (replaces JS canRead)
    pub async fn can_read(&self, subject: &SecurityLabel, object: &SecurityLabel) -> bool {
        let cache_key = format!("read::{}::{}", 
            self.label_to_cache_key(subject),
            self.label_to_cache_key(object)
        );

        // Check cache first (replaces JS cache check)
        {
            let cache = self.cache.read().await;
            if let Some(decision) = cache.peek(&cache_key) {
                // Cache hit - return cached result
                return decision.allowed;
            }
        }

        // Compute MAC decision with constant-time operation
        let allowed = constant_time::security_operation(async {
            Ok(self.evaluate_read_access(subject, object))
        }, 150).await.unwrap_or(false);

        // Cache the result
        {
            let mut cache = self.cache.write().await;
            cache.put(cache_key, MACDecision {
                allowed,
                timestamp: chrono::Utc::now(),
            });
        }

        allowed
    }

    /// Check write access under "No Write Down" rule (replaces JS canWrite)
    pub async fn can_write(&self, subject: &SecurityLabel, object: &SecurityLabel) -> bool {
        let cache_key = format!("write::{}::{}", 
            self.label_to_cache_key(subject),
            self.label_to_cache_key(object)
        );

        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(decision) = cache.peek(&cache_key) {
                return decision.allowed;
            }
        }

        // Compute MAC decision with constant-time operation
        let allowed = constant_time::security_operation(async {
            Ok(self.evaluate_write_access(subject, object))
        }, 150).await.unwrap_or(false);

        // Cache the result
        {
            let mut cache = self.cache.write().await;
            cache.put(cache_key, MACDecision {
                allowed,
                timestamp: chrono::Utc::now(),
            });
        }

        allowed
    }

    /// Enforce read access with error on violation (replaces JS enforceNoReadUp)
    pub async fn enforce_no_read_up(
        &self, 
        subject: &SecurityLabel, 
        object: &SecurityLabel
    ) -> Result<(), SecurityError> {
        if !self.can_read(subject, object).await {
            return Err(SecurityError::MACViolation { 
                operation: MACOperation::Read 
            });
        }
        Ok(())
    }

    /// Enforce write access with error on violation (replaces JS enforceNoWriteDown)
    pub async fn enforce_no_write_down(
        &self, 
        subject: &SecurityLabel, 
        object: &SecurityLabel
    ) -> Result<(), SecurityError> {
        if !self.can_write(subject, object).await {
            return Err(SecurityError::MACViolation { 
                operation: MACOperation::Write 
            });
        }
        Ok(())
    }

    /// Evaluate read access (Bell-LaPadula "No Read Up")
    fn evaluate_read_access(&self, subject: &SecurityLabel, object: &SecurityLabel) -> bool {
        // Subject clearance must be >= object classification
        if subject.level.rank() < object.level.rank() {
            return false;
        }

        // Subject compartments must be superset of object compartments
        self.is_superset(&subject.compartments, &object.compartments)
    }

    /// Evaluate write access (Bell-LaPadula "No Write Down") 
    fn evaluate_write_access(&self, subject: &SecurityLabel, object: &SecurityLabel) -> bool {
        // Subject clearance must be <= object classification
        if subject.level.rank() > object.level.rank() {
            return false;
        }

        // Subject compartments must be subset of object compartments
        self.is_subset(&subject.compartments, &object.compartments)
    }

    /// Check if set A is superset of set B (replaces JS isSuperset)
    fn is_superset(&self, a: &std::collections::HashSet<String>, b: &std::collections::HashSet<String>) -> bool {
        b.iter().all(|x| a.contains(x))
    }

    /// Check if set A is subset of set B (replaces JS isSubset)
    fn is_subset(&self, a: &std::collections::HashSet<String>, b: &std::collections::HashSet<String>) -> bool {
        a.iter().all(|x| b.contains(x))
    }

    /// Generate cache key from security label (replaces JS getCacheKey)
    fn label_to_cache_key(&self, label: &SecurityLabel) -> String {
        let mut compartments: Vec<_> = label.compartments.iter().collect();
        compartments.sort();
        format!("{}|{}", 
            format!("{:?}", label.level).to_lowercase(),
            compartments.join("+")
        )
    }

    /// Get cache statistics for observability
    pub async fn get_cache_stats(&self) -> HashMap<String, u64> {
        let cache = self.cache.read().await;
        let mut stats = HashMap::new();
        stats.insert("size".to_string(), cache.len() as u64);
        stats.insert("capacity".to_string(), cache.cap().get() as u64);
        stats
    }

    /// Clear cache (for testing or security reset)
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }
}

impl Default for MACEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn create_label(level: ClassificationLevel, compartments: Vec<&str>) -> SecurityLabel {
        SecurityLabel {
            level,
            compartments: compartments.into_iter().map(|s| s.to_string()).collect(),
        }
    }

    #[tokio::test]
    async fn test_mac_read_access() {
        let mac = MACEngine::new();
        
        // Secret user can read Confidential data
        let secret_user = create_label(ClassificationLevel::Secret, vec!["ALPHA"]);
        let confidential_data = create_label(ClassificationLevel::Confidential, vec!["ALPHA"]);
        
        assert!(mac.can_read(&secret_user, &confidential_data).await);
        
        // Confidential user cannot read Secret data (No Read Up)
        let confidential_user = create_label(ClassificationLevel::Confidential, vec!["ALPHA"]);
        let secret_data = create_label(ClassificationLevel::Secret, vec!["ALPHA"]);
        
        assert!(!mac.can_read(&confidential_user, &secret_data).await);
    }

    #[tokio::test]
    async fn test_mac_write_access() {
        let mac = MACEngine::new();
        
        // Confidential user can write to Secret data (write up allowed)
        let confidential_user = create_label(ClassificationLevel::Confidential, vec!["ALPHA"]);
        let secret_data = create_label(ClassificationLevel::Secret, vec!["ALPHA"]);
        
        assert!(mac.can_write(&confidential_user, &secret_data).await);
        
        // Secret user cannot write to Confidential data (No Write Down)
        let secret_user = create_label(ClassificationLevel::Secret, vec!["ALPHA"]);
        let confidential_data = create_label(ClassificationLevel::Confidential, vec!["ALPHA"]);
        
        assert!(!mac.can_write(&secret_user, &confidential_data).await);
    }

    #[tokio::test]
    async fn test_compartment_enforcement() {
        let mac = MACEngine::new();
        
        // User with ALPHA compartment cannot read BETA data
        let alpha_user = create_label(ClassificationLevel::Secret, vec!["ALPHA"]);
        let beta_data = create_label(ClassificationLevel::Secret, vec!["BETA"]);
        
        assert!(!mac.can_read(&alpha_user, &beta_data).await);
        
        // User with both compartments can read either
        let multi_user = create_label(ClassificationLevel::Secret, vec!["ALPHA", "BETA"]);
        
        assert!(mac.can_read(&multi_user, &beta_data).await);
    }

    #[tokio::test]
    async fn test_cache_functionality() {
        let mac = MACEngine::new();
        
        let user = create_label(ClassificationLevel::Secret, vec!["ALPHA"]);
        let data = create_label(ClassificationLevel::Confidential, vec!["ALPHA"]);
        
        // First access - should compute and cache
        let result1 = mac.can_read(&user, &data).await;
        
        // Second access - should use cache
        let result2 = mac.can_read(&user, &data).await;
        
        assert_eq!(result1, result2);
        assert!(result1); // Should be true (Secret can read Confidential)
        
        let stats = mac.get_cache_stats().await;
        assert!(stats.get("size").unwrap() > &0);
    }
}
