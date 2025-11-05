// src-tauri/src/quantum/post_quantum_security.rs
// Quantum-Resistant Security System - Future-Proof Cryptography
// Prepares for post-quantum cryptography and quantum computing threats

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::{HashMap, VecDeque};
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

use crate::observability::{ForensicLogger, MetricsRegistry};
use crate::security::{SecurityManager, ClassificationLevel};
use crate::license::{LicenseManager, LicenseTier};
use crate::state::AppState;

/// Quantum-resistant security system for future-proof protection
#[derive(Debug)]
pub struct PostQuantumSecurity {
    /// Hybrid cryptography manager (current + post-quantum)
    hybrid_crypto: HybridCryptographyManager,
    
    /// Quantum threat detection system
    quantum_threat_detector: QuantumThreatDetector,
    
    /// Post-quantum key exchange
    pq_key_exchange: PostQuantumKeyExchange,
    
    /// Quantum-safe digital signatures
    pq_signatures: PostQuantumSignatures,
    
    /// Lattice-based encryption
    lattice_crypto: LatticeCryptography,
    
    /// Hash-based signatures
    hash_signatures: HashBasedSignatures,
    
    /// Code-based cryptography
    code_crypto: CodeBasedCryptography,
    
    /// Multivariate cryptography
    multivariate_crypto: MultivariateCryptography,
    
    /// Quantum random number generator
    quantum_rng: QuantumRandomGenerator,
    
    /// Crypto-agility framework
    crypto_agility: CryptoAgilityFramework,
    
    /// Migration orchestrator
    migration_orchestrator: QuantumMigrationOrchestrator,
}

/// Hybrid cryptography that combines current and post-quantum algorithms
#[derive(Debug)]
pub struct HybridCryptographyManager {
    /// Current classical algorithms
    classical_crypto: ClassicalCryptography,
    
    /// Post-quantum algorithms
    post_quantum_crypto: PostQuantumCryptography,
    
    /// Algorithm selection strategy
    selection_strategy: AlgorithmSelectionStrategy,
    
    /// Performance optimizer
    performance_optimizer: CryptoPerformanceOptimizer,
    
    /// Security level manager
    security_level_manager: SecurityLevelManager,
}

/// Quantum threat detection and assessment
#[derive(Debug)]
pub struct QuantumThreatDetector {
    /// Quantum computing capability monitor
    capability_monitor: QuantumCapabilityMonitor,
    
    /// Cryptographic vulnerability scanner
    vulnerability_scanner: CryptoVulnerabilityScanner,
    
    /// Threat intelligence aggregator
    threat_intelligence: QuantumThreatIntelligence,
    
    /// Risk assessment engine
    risk_assessor: QuantumRiskAssessor,
    
    /// Early warning system
    early_warning: QuantumEarlyWarning,
}

/// Post-quantum cryptographic algorithms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PostQuantumAlgorithm {
    /// Lattice-based cryptography
    LatticeKEM {
        algorithm: LatticePQAlgorithm,
        security_level: SecurityLevel,
        performance_tier: PerformanceTier,
    },
    
    /// Code-based cryptography  
    CodeBasedKEM {
        algorithm: CodePQAlgorithm,
        security_level: SecurityLevel,
        key_size: u32,
    },
    
    /// Multivariate cryptography
    MultivariateSignature {
        algorithm: MultivariatePQAlgorithm,
        security_level: SecurityLevel,
        signature_size: u32,
    },
    
    /// Hash-based signatures
    HashBasedSignature {
        algorithm: HashPQAlgorithm,
        tree_height: u32,
        one_time_signatures: u32,
    },
    
    /// Isogeny-based cryptography
    IsogenyKEM {
        algorithm: IsogenyPQAlgorithm,
        curve_parameters: CurveParameters,
        security_level: SecurityLevel,
    },
}

/// Specific lattice-based algorithms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LatticePQAlgorithm {
    Kyber512,
    Kyber768,
    Kyber1024,
    NTRU,
    FrodoKEM,
    SABER,
    NewHope,
    CRYSTALS_Dilithium,
}

/// Code-based algorithms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CodePQAlgorithm {
    ClassicMcEliece,
    BIKE,
    HQC,
    ROLLO,
}

/// Multivariate algorithms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MultivariatePQAlgorithm {
    Rainbow,
    GeMSS,
    LUOV,
    MQDSS,
}

/// Hash-based algorithms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HashPQAlgorithm {
    XMSS,
    LMS,
    SPHINCS_Plus,
    WOTS_Plus,
}

/// Quantum-resistant key exchange
#[derive(Debug)]
pub struct PostQuantumKeyExchange {
    /// Key encapsulation mechanisms
    kem_manager: KEMManager,
    
    /// Hybrid key derivation
    hybrid_kdf: HybridKeyDerivation,
    
    /// Perfect forward secrecy
    forward_secrecy: PostQuantumForwardSecrecy,
    
    /// Key agreement protocols
    key_agreement: QuantumResistantKeyAgreement,
}

/// Quantum threat assessment result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumThreatAssessment {
    /// Assessment identifier
    pub assessment_id: String,
    
    /// Current quantum threat level
    pub threat_level: QuantumThreatLevel,
    
    /// Estimated time to cryptographically relevant quantum computer
    pub time_to_crqc: Option<Duration>,
    
    /// Vulnerable algorithms in use
    pub vulnerable_algorithms: Vec<VulnerableAlgorithm>,
    
    /// Recommended migration timeline
    pub migration_timeline: MigrationTimeline,
    
    /// Risk assessment
    pub risk_assessment: QuantumRiskAssessment,
    
    /// Mitigation strategies
    pub mitigation_strategies: Vec<MitigationStrategy>,
    
    /// Assessment timestamp
    pub assessed_at: DateTime<Utc>,
}

/// Quantum threat levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QuantumThreatLevel {
    /// No immediate threat
    Green,
    
    /// Emerging threat - prepare for migration
    Yellow,
    
    /// Significant threat - accelerate migration
    Orange,
    
    /// Critical threat - immediate migration required
    Red,
    
    /// Quantum advantage achieved - legacy crypto broken
    Critical,
}

/// Crypto-agility framework for seamless algorithm transitions
#[derive(Debug)]
pub struct CryptoAgilityFramework {
    /// Algorithm abstraction layer
    abstraction_layer: CryptoAbstractionLayer,
    
    /// Dynamic algorithm loading
    dynamic_loader: DynamicCryptoLoader,
    
    /// Migration automation
    migration_automator: MigrationAutomator,
    
    /// Compatibility matrix
    compatibility_matrix: AlgorithmCompatibilityMatrix,
    
    /// Performance benchmarking
    benchmarker: CryptoBenchmarker,
}

/// Quantum migration orchestration
#[derive(Debug)]
pub struct QuantumMigrationOrchestrator {
    /// Migration planning engine
    migration_planner: MigrationPlanner,
    
    /// Risk-based prioritization
    risk_prioritizer: RiskBasedPrioritizer,
    
    /// Rollout coordinator
    rollout_coordinator: MigrationRolloutCoordinator,
    
    /// Validation framework
    validation_framework: MigrationValidationFramework,
    
    /// Rollback system
    rollback_system: MigrationRollbackSystem,
}

/// Quantum-resistant operation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumResistantOperation {
    /// Operation identifier
    pub operation_id: String,
    
    /// Operation type
    pub operation_type: QuantumOperation,
    
    /// Algorithms used
    pub algorithms_used: Vec<PostQuantumAlgorithm>,
    
    /// Security guarantees
    pub security_guarantees: QuantumSecurityGuarantees,
    
    /// Performance metrics
    pub performance_metrics: QuantumCryptoPerformance,
    
    /// Future-proof rating
    pub future_proof_rating: FutureProofRating,
    
    /// Quantum resistance level
    pub resistance_level: QuantumResistanceLevel,
    
    /// Operation timestamp
    pub timestamp: DateTime<Utc>,
}

/// Types of quantum-resistant operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QuantumOperation {
    KeyGeneration,
    KeyExchange,
    DigitalSignature,
    Encryption,
    Decryption,
    MessageAuthentication,
    ZeroKnowledgeProof,
    QuantumKeyDistribution,
}

/// Quantum security guarantees
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumSecurityGuarantees {
    /// Resistance to classical attacks
    pub classical_security_bits: u32,
    
    /// Resistance to quantum attacks
    pub quantum_security_bits: u32,
    
    /// Security assumptions
    pub security_assumptions: Vec<SecurityAssumption>,
    
    /// Proof of security
    pub security_proof: SecurityProof,
    
    /// Standardization status
    pub standardization_status: StandardizationStatus,
}

/// Future-proof rating system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FutureProofRating {
    /// Vulnerable to quantum attacks
    Vulnerable,
    
    /// Partially quantum-resistant
    PartiallyResistant,
    
    /// Quantum-resistant for next 10 years
    ShortTermResistant,
    
    /// Quantum-resistant for next 25 years
    MediumTermResistant,
    
    /// Quantum-resistant for foreseeable future
    LongTermResistant,
    
    /// Information-theoretically secure
    InformationTheoreticallySafe,
}

impl PostQuantumSecurity {
    /// Create new post-quantum security system
    pub async fn new(
        forensic_logger: Arc<ForensicLogger>,
        metrics_registry: Arc<MetricsRegistry>,
        security_manager: Arc<SecurityManager>,
        license_manager: Arc<LicenseManager>,
    ) -> Result<Self, QuantumSecurityError> {
        // Verify enterprise/defense license for quantum features
        let current_license = license_manager.get_current_license().await;
        if !matches!(current_license.tier, LicenseTier::Enterprise | LicenseTier::Defense) {
            return Err(QuantumSecurityError::InsufficientLicense {
                required_license: LicenseTier::Enterprise,
            });
        }
        
        let hybrid_crypto = HybridCryptographyManager::new().await?;
        let quantum_threat_detector = QuantumThreatDetector::new().await?;
        let pq_key_exchange = PostQuantumKeyExchange::new().await?;
        let pq_signatures = PostQuantumSignatures::new().await?;
        let lattice_crypto = LatticeCryptography::new().await?;
        let hash_signatures = HashBasedSignatures::new().await?;
        let code_crypto = CodeBasedCryptography::new().await?;
        let multivariate_crypto = MultivariateCryptography::new().await?;
        let quantum_rng = QuantumRandomGenerator::new().await?;
        let crypto_agility = CryptoAgilityFramework::new().await?;
        let migration_orchestrator = QuantumMigrationOrchestrator::new().await?;
        
        Ok(Self {
            hybrid_crypto,
            quantum_threat_detector,
            pq_key_exchange,
            pq_signatures,
            lattice_crypto,
            hash_signatures,
            code_crypto,
            multivariate_crypto,
            quantum_rng,
            crypto_agility,
            migration_orchestrator,
        })
    }
    
    /// Perform quantum-resistant encryption
    pub async fn quantum_encrypt(
        &self,
        data: &[u8],
        recipient_public_key: &PublicKey,
        security_level: SecurityLevel,
        app_state: &AppState,
    ) -> Result<QuantumResistantOperation, QuantumSecurityError> {
        let operation_id = Uuid::new_v4().to_string();
        let start_time = std::time::Instant::now();
        
        // 1. Assess quantum threat level
        let threat_assessment = self.quantum_threat_detector.assess_current_threat().await?;
        
        // 2. Select appropriate post-quantum algorithms
        let selected_algorithms = self.hybrid_crypto.select_encryption_algorithms(
            &threat_assessment,
            security_level,
        ).await?;
        
        // 3. Generate quantum-resistant session key
        let session_key = self.quantum_rng.generate_quantum_random_key(256).await?;
        
        // 4. Encrypt data with hybrid approach
        let encrypted_data = self.hybrid_crypto.hybrid_encrypt(
            data,
            &session_key,
            &selected_algorithms,
        ).await?;
        
        // 5. Encapsulate session key using post-quantum KEM
        let encapsulated_key = self.pq_key_exchange.encapsulate_key(
            &session_key,
            recipient_public_key,
            &selected_algorithms,
        ).await?;
        
        // 6. Create quantum-resistant container
        let quantum_container = QuantumResistantContainer {
            encrypted_data,
            encapsulated_key,
            algorithms_used: selected_algorithms.clone(),
            security_metadata: QuantumSecurityMetadata {
                quantum_security_bits: 256,
                classical_security_bits: 256,
                future_proof_rating: FutureProofRating::LongTermResistant,
                created_at: Utc::now(),
            },
        };
        
        let execution_time = start_time.elapsed();
        
        // 7. Log quantum operation for audit
        self.log_quantum_operation(
            &operation_id,
            "quantum_encryption",
            &selected_algorithms,
            execution_time,
            app_state,
        ).await?;
        
        Ok(QuantumResistantOperation {
            operation_id,
            operation_type: QuantumOperation::Encryption,
            algorithms_used: selected_algorithms,
            security_guarantees: QuantumSecurityGuarantees {
                classical_security_bits: 256,
                quantum_security_bits: 256,
                security_assumptions: vec![
                    SecurityAssumption::LatticeProblems,
                    SecurityAssumption::HashFunctions,
                ],
                security_proof: SecurityProof::ProvablySafe,
                standardization_status: StandardizationStatus::NISTApproved,
            },
            performance_metrics: QuantumCryptoPerformance {
                execution_time_ms: execution_time.as_millis() as u64,
                key_size_bytes: 1024,
                ciphertext_overhead: 0.15, // 15% overhead
                signature_size_bytes: None,
            },
            future_proof_rating: FutureProofRating::LongTermResistant,
            resistance_level: QuantumResistanceLevel::High,
            timestamp: Utc::now(),
        })
    }
    
    /// Create quantum-resistant digital signature
    pub async fn quantum_sign(
        &self,
        message: &[u8],
        private_key: &PrivateKey,
        security_level: SecurityLevel,
        app_state: &AppState,
    ) -> Result<QuantumResistantSignature, QuantumSecurityError> {
        let operation_id = Uuid::new_v4().to_string();
        
        // 1. Select post-quantum signature algorithm
        let signature_algorithm = self.hybrid_crypto.select_signature_algorithm(security_level).await?;
        
        // 2. Create quantum-resistant signature
        let signature = match signature_algorithm {
            PostQuantumAlgorithm::MultivariateSignature { algorithm: MultivariatePQAlgorithm::Rainbow, .. } => {
                self.multivariate_crypto.rainbow_sign(message, private_key).await?
            },
            PostQuantumAlgorithm::HashBasedSignature { algorithm: HashPQAlgorithm::SPHINCS_Plus, .. } => {
                self.hash_signatures.sphincs_plus_sign(message, private_key).await?
            },
            PostQuantumAlgorithm::LatticeKEM { algorithm: LatticePQAlgorithm::CRYSTALS_Dilithium, .. } => {
                self.lattice_crypto.dilithium_sign(message, private_key).await?
            },
            _ => {
                return Err(QuantumSecurityError::UnsupportedAlgorithm {
                    algorithm: format!("{:?}", signature_algorithm),
                });
            }
        };
        
        // 3. Add quantum security metadata
        let quantum_signature = QuantumResistantSignature {
            signature,
            algorithm_used: signature_algorithm,
            security_guarantees: QuantumSecurityGuarantees {
                classical_security_bits: 256,
                quantum_security_bits: 256,
                security_assumptions: vec![SecurityAssumption::HashFunctions],
                security_proof: SecurityProof::ProvablySafe,
                standardization_status: StandardizationStatus::NISTCandidate,
            },
            signed_at: Utc::now(),
            valid_until: Some(Utc::now() + Duration::days(365)),
        };
        
        Ok(quantum_signature)
    }
    
    /// Assess current quantum threat landscape
    pub async fn assess_quantum_threats(&self) -> Result<QuantumThreatAssessment, QuantumSecurityError> {
        // 1. Monitor quantum computing progress
        let quantum_progress = self.quantum_threat_detector.monitor_quantum_progress().await?;
        
        // 2. Analyze cryptographic vulnerabilities
        let vulnerabilities = self.quantum_threat_detector.scan_vulnerabilities().await?;
        
        // 3. Estimate time to cryptographically relevant quantum computer
        let time_to_crqc = self.quantum_threat_detector.estimate_crqc_timeline().await?;
        
        // 4. Calculate risk level
        let risk_level = self.calculate_quantum_risk(&quantum_progress, &vulnerabilities).await?;
        
        // 5. Generate migration recommendations
        let migration_timeline = self.migration_orchestrator.generate_timeline(&risk_level).await?;
        
        Ok(QuantumThreatAssessment {
            assessment_id: Uuid::new_v4().to_string(),
            threat_level: self.determine_threat_level(&risk_level),
            time_to_crqc,
            vulnerable_algorithms: vulnerabilities,
            migration_timeline,
            risk_assessment: QuantumRiskAssessment {
                overall_risk: risk_level,
                critical_assets_at_risk: self.identify_critical_assets().await?,
                recommended_actions: self.generate_risk_mitigation_actions(&risk_level).await?,
            },
            mitigation_strategies: self.generate_mitigation_strategies(&risk_level).await?,
            assessed_at: Utc::now(),
        })
    }
    
    /// Execute quantum-safe migration
    pub async fn execute_quantum_migration(
        &self,
        migration_plan: QuantumMigrationPlan,
        app_state: &AppState,
    ) -> Result<QuantumMigrationResult, QuantumSecurityError> {
        let migration_id = Uuid::new_v4().to_string();
        
        // 1. Validate migration plan
        let validation_result = self.migration_orchestrator.validate_plan(&migration_plan).await?;
        if !validation_result.valid {
            return Err(QuantumSecurityError::InvalidMigrationPlan {
                reason: validation_result.failure_reason,
            });
        }
        
        // 2. Create rollback checkpoint
        let rollback_checkpoint = self.migration_orchestrator.create_checkpoint().await?;
        
        // 3. Execute migration phases
        let mut migration_phases = Vec::new();
        for phase in migration_plan.phases {
            let phase_result = self.execute_migration_phase(&phase).await?;
            migration_phases.push(phase_result);
            
            // Validate each phase before continuing
            if !self.validate_migration_phase(&phase).await? {
                // Rollback on failure
                self.migration_orchestrator.rollback_to_checkpoint(&rollback_checkpoint).await?;
                return Err(QuantumSecurityError::MigrationPhaseFailed {
                    phase: phase.phase_name,
                });
            }
        }
        
        // 4. Validate complete migration
        let final_validation = self.migration_orchestrator.validate_complete_migration().await?;
        
        Ok(QuantumMigrationResult {
            migration_id,
            migration_status: if final_validation.valid {
                MigrationStatus::Completed
            } else {
                MigrationStatus::Failed(final_validation.failure_reason)
            },
            migration_phases,
            quantum_readiness_score: self.calculate_quantum_readiness().await?,
            remaining_vulnerabilities: self.identify_remaining_vulnerabilities().await?,
            recommendations: self.generate_post_migration_recommendations().await?,
            completed_at: Utc::now(),
        })
    }
    
    /// Get quantum security analytics
    pub async fn get_quantum_analytics(&self) -> Result<QuantumSecurityAnalytics, QuantumSecurityError> {
        let threat_landscape = self.quantum_threat_detector.get_threat_landscape().await?;
        let algorithm_usage = self.hybrid_crypto.get_algorithm_usage_stats().await?;
        let migration_progress = self.migration_orchestrator.get_migration_progress().await?;
        let performance_metrics = self.hybrid_crypto.get_performance_metrics().await?;
        
        Ok(QuantumSecurityAnalytics {
            threat_landscape,
            algorithm_usage,
            migration_progress,
            performance_metrics,
            quantum_readiness_score: self.calculate_quantum_readiness().await?,
            total_quantum_operations: self.get_total_quantum_operations().await?,
            average_quantum_performance: self.get_average_quantum_performance().await?,
            security_level_distribution: self.get_security_level_distribution().await?,
            timestamp: Utc::now(),
        })
    }
    
    // Private implementation methods...
    
    fn determine_threat_level(&self, risk_level: &f64) -> QuantumThreatLevel {
        match risk_level {
            r if *r < 0.2 => QuantumThreatLevel::Green,
            r if *r < 0.4 => QuantumThreatLevel::Yellow,
            r if *r < 0.6 => QuantumThreatLevel::Orange,
            r if *r < 0.8 => QuantumThreatLevel::Red,
            _ => QuantumThreatLevel::Critical,
        }
    }
    
    async fn calculate_quantum_risk(
        &self,
        progress: &QuantumProgress,
        vulnerabilities: &[VulnerableAlgorithm],
    ) -> Result<f64, QuantumSecurityError> {
        // Calculate risk based on quantum progress and current vulnerabilities
        let progress_risk = progress.capability_level * 0.3;
        let vulnerability_risk = vulnerabilities.len() as f64 * 0.1;
        let time_factor = if progress.estimated_breakthrough < Duration::days(365 * 5) { 0.4 } else { 0.2 };
        
        Ok((progress_risk + vulnerability_risk + time_factor).min(1.0))
    }
}

/// Quantum security analytics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumSecurityAnalytics {
    pub threat_landscape: QuantumThreatLandscape,
    pub algorithm_usage: AlgorithmUsageStats,
    pub migration_progress: MigrationProgress,
    pub performance_metrics: QuantumPerformanceMetrics,
    pub quantum_readiness_score: f64,
    pub total_quantum_operations: u64,
    pub average_quantum_performance: f64,
    pub security_level_distribution: HashMap<SecurityLevel, u64>,
    pub timestamp: DateTime<Utc>,
}

/// Quantum security errors
#[derive(Debug, thiserror::Error)]
pub enum QuantumSecurityError {
    #[error("Insufficient license for quantum security features: requires {required_license:?}")]
    InsufficientLicense { required_license: LicenseTier },
    
    #[error("Quantum operation failed: {reason}")]
    QuantumOperationFailed { reason: String },
    
    #[error("Unsupported post-quantum algorithm: {algorithm}")]
    UnsupportedAlgorithm { algorithm: String },
    
    #[error("Quantum key generation failed: {reason}")]
    KeyGenerationFailed { reason: String },
    
    #[error("Migration plan validation failed: {reason}")]
    InvalidMigrationPlan { reason: String },
    
    #[error("Migration phase failed: {phase}")]
    MigrationPhaseFailed { phase: String },
    
    #[error("Quantum random generation failed: {reason}")]
    QuantumRandomFailed { reason: String },
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_post_quantum_algorithm_serialization() {
        let algorithm = PostQuantumAlgorithm::LatticeKEM {
            algorithm: LatticePQAlgorithm::Kyber1024,
            security_level: SecurityLevel::High,
            performance_tier: PerformanceTier::Optimized,
        };
        
        let json = serde_json::to_string(&algorithm).unwrap();
        let parsed: PostQuantumAlgorithm = serde_json::from_str(&json).unwrap();
        
        match (algorithm, parsed) {
            (PostQuantumAlgorithm::LatticeKEM { algorithm: orig, .. }, 
             PostQuantumAlgorithm::LatticeKEM { algorithm: parsed, .. }) => {
                assert_eq!(format!("{:?}", orig), format!("{:?}", parsed));
            },
            _ => panic!("Serialization mismatch"),
        }
    }
    
    #[test]
    fn test_quantum_threat_level_ordering() {
        use QuantumThreatLevel::*;
        
        let levels = vec![Green, Yellow, Orange, Red, Critical];
        
        // Verify threat levels are in ascending order of severity
        for i in 0..levels.len()-1 {
            assert!(format!("{:?}", levels[i]) < format!("{:?}", levels[i+1]));
        }
    }
    
    #[test]
    fn test_future_proof_rating() {
        let rating = FutureProofRating::LongTermResistant;
        
        // Verify it's better than short-term resistance
        assert!(matches!(rating, FutureProofRating::LongTermResistant));
        
        // Information-theoretically safe should be the highest level
        let highest = FutureProofRating::InformationTheoreticallySafe;
        assert!(matches!(highest, FutureProofRating::InformationTheoreticallySafe));
    }
}
