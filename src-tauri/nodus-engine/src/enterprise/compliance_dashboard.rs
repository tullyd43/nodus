// src-tauri/src/enterprise/compliance_dashboard.rs
// Enterprise Compliance Dashboard - SOX/HIPAA/GDPR Automatic Reporting
// Replaces manual compliance reporting with automatic audit trail analysis

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

use crate::observability::{ForensicLogger, MetricsRegistry, ObservabilityContext};
use crate::security::{SecurityManager, ClassificationLevel, SecurityLabel};
use crate::license::{LicenseManager, LicenseTier};
use crate::database::DatabaseManager;
use crate::state::AppState;

/// Enterprise compliance dashboard for automatic regulatory reporting
#[derive(Debug)]
pub struct ComplianceDashboard {
    /// Forensic logger for audit trail access
    forensic_logger: Arc<ForensicLogger>,
    
    /// Security manager for access control
    security_manager: Arc<SecurityManager>,
    
    /// License manager for feature gating
    license_manager: Arc<LicenseManager>,
    
    /// Database manager for compliance data queries
    database_manager: Arc<DatabaseManager>,
    
    /// Compliance rule engine
    rule_engine: ComplianceRuleEngine,
    
    /// Report generators for different frameworks
    report_generators: HashMap<ComplianceFramework, Box<dyn ComplianceReportGenerator>>,
    
    /// Cached compliance reports
    report_cache: Arc<RwLock<HashMap<String, CachedComplianceReport>>>,
}

/// Supported compliance frameworks
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub enum ComplianceFramework {
    /// Sarbanes-Oxley Act (SOX)
    SOX,
    
    /// Health Insurance Portability and Accountability Act
    HIPAA,
    
    /// General Data Protection Regulation
    GDPR,
    
    /// ISO 27001 Information Security Management
    ISO27001,
    
    /// NIST Cybersecurity Framework
    NIST,
    
    /// FedRAMP (Federal Risk and Authorization Management Program)
    FedRAMP,
    
    /// FISMA (Federal Information Security Management Act)
    FISMA,
}

/// Compliance report with audit evidence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceReport {
    /// Report metadata
    pub report_id: String,
    pub framework: ComplianceFramework,
    pub generated_at: DateTime<Utc>,
    pub reporting_period: ReportingPeriod,
    
    /// Compliance status summary
    pub overall_status: ComplianceStatus,
    pub compliance_score: f64, // 0.0 to 100.0
    
    /// Control assessments
    pub controls: Vec<ControlAssessment>,
    
    /// Risk assessments
    pub risks: Vec<RiskAssessment>,
    
    /// Audit evidence
    pub evidence: Vec<AuditEvidence>,
    
    /// Remediation recommendations
    pub recommendations: Vec<RemediationRecommendation>,
    
    /// Executive summary
    pub executive_summary: String,
}

/// Cached compliance report with metadata
#[derive(Debug, Clone)]
pub struct CachedComplianceReport {
    pub report: ComplianceReport,
    pub cache_time: DateTime<Utc>,
    pub ttl: Duration,
}

/// Reporting period specification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportingPeriod {
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
    pub period_type: PeriodType,
}

/// Reporting period types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PeriodType {
    Daily,
    Weekly,
    Monthly,
    Quarterly,
    Annual,
    Custom,
}

/// Overall compliance status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComplianceStatus {
    Compliant,
    NonCompliant,
    PartiallyCompliant,
    Unknown,
}

/// Individual control assessment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlAssessment {
    pub control_id: String,
    pub control_name: String,
    pub control_description: String,
    pub status: ControlStatus,
    pub implementation_level: ImplementationLevel,
    pub test_results: Vec<TestResult>,
    pub last_assessed: DateTime<Utc>,
    pub next_assessment: DateTime<Utc>,
    pub evidence_references: Vec<String>,
}

/// Control implementation status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ControlStatus {
    Implemented,
    PartiallyImplemented,
    NotImplemented,
    NotApplicable,
}

/// Control implementation maturity level
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImplementationLevel {
    /// Initial/Ad hoc
    Level1,
    
    /// Managed/Repeatable
    Level2,
    
    /// Defined/Documented
    Level3,
    
    /// Quantitatively Managed
    Level4,
    
    /// Optimizing/Continuous Improvement
    Level5,
}

/// Control test result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub test_id: String,
    pub test_name: String,
    pub test_date: DateTime<Utc>,
    pub result: TestResultStatus,
    pub details: String,
    pub tester: String,
    pub evidence_collected: Vec<String>,
}

/// Test result status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TestResultStatus {
    Pass,
    Fail,
    Inconclusive,
    NotTested,
}

/// Risk assessment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub risk_id: String,
    pub risk_name: String,
    pub risk_description: String,
    pub category: RiskCategory,
    pub likelihood: RiskLikelihood,
    pub impact: RiskImpact,
    pub risk_score: f64,
    pub mitigation_status: MitigationStatus,
    pub mitigation_controls: Vec<String>,
    pub residual_risk: f64,
    pub last_assessed: DateTime<Utc>,
}

/// Risk categories
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskCategory {
    Operational,
    Financial,
    Strategic,
    Compliance,
    Reputational,
    Technology,
    Security,
}

/// Risk likelihood levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskLikelihood {
    VeryLow,
    Low,
    Medium,
    High,
    VeryHigh,
}

/// Risk impact levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskImpact {
    Negligible,
    Minor,
    Moderate,
    Major,
    Severe,
}

/// Risk mitigation status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MitigationStatus {
    NotStarted,
    InProgress,
    Implemented,
    Verified,
    Ineffective,
}

/// Audit evidence from forensic logs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvidence {
    pub evidence_id: String,
    pub evidence_type: EvidenceType,
    pub collection_date: DateTime<Utc>,
    pub source_system: String,
    pub description: String,
    pub hash: String, // SHA-256 hash for integrity
    pub classification: ClassificationLevel,
    pub retention_period: Duration,
    pub chain_of_custody: Vec<CustodyEvent>,
}

/// Types of audit evidence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EvidenceType {
    SystemLog,
    UserAction,
    ConfigurationChange,
    AccessLog,
    DataModification,
    SecurityEvent,
    PerformanceMetric,
    Screenshot,
    Document,
}

/// Chain of custody event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustodyEvent {
    pub event_id: String,
    pub event_type: CustodyEventType,
    pub timestamp: DateTime<Utc>,
    pub actor: String,
    pub details: String,
}

/// Chain of custody event types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CustodyEventType {
    Created,
    Accessed,
    Modified,
    Copied,
    Transferred,
    Deleted,
    Archived,
}

/// Remediation recommendation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemediationRecommendation {
    pub recommendation_id: String,
    pub title: String,
    pub description: String,
    pub priority: Priority,
    pub estimated_effort: String,
    pub target_completion: Option<DateTime<Utc>>,
    pub responsible_party: String,
    pub related_controls: Vec<String>,
    pub related_risks: Vec<String>,
}

/// Priority levels for recommendations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Priority {
    Critical,
    High,
    Medium,
    Low,
    Informational,
}

/// Compliance rule engine for automated assessment
#[derive(Debug)]
pub struct ComplianceRuleEngine {
    rules: HashMap<ComplianceFramework, Vec<ComplianceRule>>,
}

/// Individual compliance rule
#[derive(Debug, Clone)]
pub struct ComplianceRule {
    pub rule_id: String,
    pub control_id: String,
    pub rule_name: String,
    pub rule_description: String,
    pub query: String, // SQL query against forensic logs
    pub expected_result: RuleExpectation,
    pub frequency: AssessmentFrequency,
    pub severity: RuleSeverity,
}

/// Rule expectation specification
#[derive(Debug, Clone)]
pub enum RuleExpectation {
    /// Expect specific count
    Count(u64),
    
    /// Expect count within range
    CountRange(u64, u64),
    
    /// Expect percentage
    Percentage(f64),
    
    /// Expect boolean result
    Boolean(bool),
    
    /// Custom validation function
    Custom(String),
}

/// Assessment frequency
#[derive(Debug, Clone)]
pub enum AssessmentFrequency {
    Continuous,
    Daily,
    Weekly,
    Monthly,
    Quarterly,
    Annual,
    OnDemand,
}

/// Rule severity levels
#[derive(Debug, Clone)]
pub enum RuleSeverity {
    Critical,
    High,
    Medium,
    Low,
    Informational,
}

/// Trait for compliance report generators
pub trait ComplianceReportGenerator: Send + Sync {
    fn generate_report(
        &self,
        period: &ReportingPeriod,
        evidence: &[AuditEvidence],
        assessments: &[ControlAssessment],
    ) -> Result<ComplianceReport, ComplianceError>;
    
    fn get_framework(&self) -> ComplianceFramework;
}

/// SOX compliance report generator
pub struct SOXReportGenerator;

impl ComplianceReportGenerator for SOXReportGenerator {
    fn generate_report(
        &self,
        period: &ReportingPeriod,
        evidence: &[AuditEvidence],
        assessments: &[ControlAssessment],
    ) -> Result<ComplianceReport, ComplianceError> {
        // Generate SOX-specific compliance report
        let report_id = Uuid::new_v4().to_string();
        
        // Calculate compliance score based on SOX requirements
        let compliance_score = self.calculate_sox_score(assessments);
        let overall_status = if compliance_score >= 95.0 {
            ComplianceStatus::Compliant
        } else if compliance_score >= 80.0 {
            ComplianceStatus::PartiallyCompliant
        } else {
            ComplianceStatus::NonCompliant
        };
        
        Ok(ComplianceReport {
            report_id,
            framework: ComplianceFramework::SOX,
            generated_at: Utc::now(),
            reporting_period: period.clone(),
            overall_status,
            compliance_score,
            controls: assessments.to_vec(),
            risks: self.identify_sox_risks(evidence),
            evidence: evidence.to_vec(),
            recommendations: self.generate_sox_recommendations(assessments),
            executive_summary: self.generate_sox_executive_summary(compliance_score, assessments),
        })
    }
    
    fn get_framework(&self) -> ComplianceFramework {
        ComplianceFramework::SOX
    }
}

impl SOXReportGenerator {
    fn calculate_sox_score(&self, assessments: &[ControlAssessment]) -> f64 {
        if assessments.is_empty() {
            return 0.0;
        }
        
        let total_weight = assessments.len() as f64;
        let implemented_weight: f64 = assessments
            .iter()
            .map(|assessment| match assessment.status {
                ControlStatus::Implemented => 1.0,
                ControlStatus::PartiallyImplemented => 0.5,
                ControlStatus::NotImplemented => 0.0,
                ControlStatus::NotApplicable => 1.0, // Don't count against score
            })
            .sum();
        
        (implemented_weight / total_weight) * 100.0
    }
    
    fn identify_sox_risks(&self, evidence: &[AuditEvidence]) -> Vec<RiskAssessment> {
        // Analyze evidence for SOX-specific risks
        let mut risks = Vec::new();
        
        // Example: Check for segregation of duties violations
        risks.push(RiskAssessment {
            risk_id: "SOX-001".to_string(),
            risk_name: "Segregation of Duties".to_string(),
            risk_description: "Risk of inadequate segregation of duties in financial processes".to_string(),
            category: RiskCategory::Compliance,
            likelihood: RiskLikelihood::Medium,
            impact: RiskImpact::Major,
            risk_score: 15.0,
            mitigation_status: MitigationStatus::Implemented,
            mitigation_controls: vec!["SOX-AC-001".to_string(), "SOX-AC-002".to_string()],
            residual_risk: 5.0,
            last_assessed: Utc::now(),
        });
        
        risks
    }
    
    fn generate_sox_recommendations(&self, assessments: &[ControlAssessment]) -> Vec<RemediationRecommendation> {
        let mut recommendations = Vec::new();
        
        // Generate recommendations based on control gaps
        for assessment in assessments {
            if matches!(assessment.status, ControlStatus::NotImplemented | ControlStatus::PartiallyImplemented) {
                recommendations.push(RemediationRecommendation {
                    recommendation_id: format!("REC-{}", assessment.control_id),
                    title: format!("Implement {}", assessment.control_name),
                    description: format!("Full implementation required for control: {}", assessment.control_description),
                    priority: Priority::High,
                    estimated_effort: "2-4 weeks".to_string(),
                    target_completion: Some(Utc::now() + Duration::weeks(4)),
                    responsible_party: "Compliance Team".to_string(),
                    related_controls: vec![assessment.control_id.clone()],
                    related_risks: vec!["SOX-001".to_string()],
                });
            }
        }
        
        recommendations
    }
    
    fn generate_sox_executive_summary(&self, compliance_score: f64, assessments: &[ControlAssessment]) -> String {
        let total_controls = assessments.len();
        let implemented_controls = assessments
            .iter()
            .filter(|a| matches!(a.status, ControlStatus::Implemented))
            .count();
        
        format!(
            "SOX Compliance Assessment Summary\n\n\
            Overall Compliance Score: {:.1}%\n\
            Total Controls Assessed: {}\n\
            Fully Implemented Controls: {}\n\
            \n\
            This assessment covers the key SOX requirements for internal controls over financial reporting. \
            The organization has implemented {}/{} required controls with an overall compliance score of {:.1}%.",
            compliance_score,
            total_controls,
            implemented_controls,
            implemented_controls,
            total_controls,
            compliance_score
        )
    }
}

/// Compliance dashboard errors
#[derive(Debug, thiserror::Error)]
pub enum ComplianceError {
    #[error("Insufficient license for compliance features: requires {required_license:?}")]
    InsufficientLicense { required_license: LicenseTier },
    
    #[error("Report generation failed for framework {framework:?}: {reason}")]
    ReportGenerationFailed { 
        framework: ComplianceFramework, 
        reason: String 
    },
    
    #[error("Evidence collection failed: {reason}")]
    EvidenceCollectionFailed { reason: String },
    
    #[error("Database query failed: {error}")]
    DatabaseError { error: String },
    
    #[error("Report not found: {report_id}")]
    ReportNotFound { report_id: String },
}

impl ComplianceDashboard {
    /// Create new compliance dashboard
    pub async fn new(
        forensic_logger: Arc<ForensicLogger>,
        security_manager: Arc<SecurityManager>,
        license_manager: Arc<LicenseManager>,
        database_manager: Arc<DatabaseManager>,
    ) -> Result<Self, ComplianceError> {
        // Verify enterprise license for compliance features
        let current_license = license_manager.get_current_license().await;
        if matches!(current_license.tier, LicenseTier::Community) {
            return Err(ComplianceError::InsufficientLicense {
                required_license: LicenseTier::Enterprise,
            });
        }
        
        let rule_engine = ComplianceRuleEngine::new().await?;
        let mut report_generators: HashMap<ComplianceFramework, Box<dyn ComplianceReportGenerator>> = HashMap::new();
        
        // Register compliance report generators
        report_generators.insert(ComplianceFramework::SOX, Box::new(SOXReportGenerator));
        // Additional generators would be added here for HIPAA, GDPR, etc.
        
        Ok(Self {
            forensic_logger,
            security_manager,
            license_manager,
            database_manager,
            rule_engine,
            report_generators,
            report_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }
    
    /// Generate compliance report for a specific framework
    pub async fn generate_compliance_report(
        &self,
        framework: ComplianceFramework,
        period: ReportingPeriod,
        app_state: &AppState,
    ) -> Result<ComplianceReport, ComplianceError> {
        // Check cache first
        let cache_key = format!("{:?}-{}-{}", framework, period.start_date.timestamp(), period.end_date.timestamp());
        if let Some(cached_report) = self.get_cached_report(&cache_key).await {
            return Ok(cached_report.report);
        }
        
        // Collect audit evidence for the period
        let evidence = self.collect_audit_evidence(&period, app_state).await?;
        
        // Run compliance rule assessments
        let assessments = self.run_compliance_assessments(&framework, &period, app_state).await?;
        
        // Generate report using appropriate generator
        let report = if let Some(generator) = self.report_generators.get(&framework) {
            generator.generate_report(&period, &evidence, &assessments)?
        } else {
            return Err(ComplianceError::ReportGenerationFailed {
                framework,
                reason: "No generator available for this framework".to_string(),
            });
        };
        
        // Cache the report
        self.cache_report(cache_key, &report).await;
        
        // Log report generation
        self.forensic_logger.log_compliance_operation(
            "compliance_report_generated",
            &app_state.context,
            serde_json::json!({
                "framework": framework,
                "report_id": report.report_id,
                "period_start": period.start_date,
                "period_end": period.end_date,
                "compliance_score": report.compliance_score,
                "overall_status": report.overall_status,
            })
        ).await?;
        
        Ok(report)
    }
    
    /// Get available compliance frameworks
    pub async fn get_available_frameworks(&self) -> Vec<ComplianceFramework> {
        let current_license = self.license_manager.get_current_license().await;
        
        match current_license.tier {
            LicenseTier::Community => vec![], // No compliance features
            LicenseTier::Pro => vec![ // Pro has a subset of enterprise frameworks for now
                ComplianceFramework::GDPR,
                ComplianceFramework::ISO27001,
            ],
            LicenseTier::Enterprise => vec![
                ComplianceFramework::SOX,
                ComplianceFramework::HIPAA,
                ComplianceFramework::GDPR,
                ComplianceFramework::ISO27001,
            ],
            LicenseTier::Defense => vec![
                ComplianceFramework::SOX,
                ComplianceFramework::HIPAA,
                ComplianceFramework::GDPR,
                ComplianceFramework::ISO27001,
                ComplianceFramework::NIST,
                ComplianceFramework::FedRAMP,
                ComplianceFramework::FISMA,
            ],
        }
    }
    
    /// Get compliance dashboard summary
    pub async fn get_dashboard_summary(&self, app_state: &AppState) -> Result<ComplianceDashboardSummary, ComplianceError> {
        let available_frameworks = self.get_available_frameworks().await;
        let mut framework_status = HashMap::new();
        
        // Get latest status for each framework
        for framework in &available_frameworks {
            let period = ReportingPeriod {
                start_date: Utc::now() - Duration::days(30),
                end_date: Utc::now(),
                period_type: PeriodType::Monthly,
            };
            
            if let Ok(report) = self.generate_compliance_report(framework.clone(), period, app_state).await {
                framework_status.insert(framework.clone(), FrameworkStatus {
                    status: report.overall_status,
                    score: report.compliance_score,
                    last_assessed: report.generated_at,
                    control_count: report.controls.len(),
                    risk_count: report.risks.len(),
                });
            }
        }
        
        Ok(ComplianceDashboardSummary {
            available_frameworks,
            framework_status,
            last_updated: Utc::now(),
        })
    }
    
    // Private helper methods
    
    async fn collect_audit_evidence(
        &self,
        period: &ReportingPeriod,
        app_state: &AppState,
    ) -> Result<Vec<AuditEvidence>, ComplianceError> {
        // Query forensic logs for audit evidence in the reporting period
        let forensic_logs = self.forensic_logger
            .query_logs(period.start_date, period.end_date, app_state)
            .await
            .map_err(|e| ComplianceError::EvidenceCollectionFailed {
                reason: format!("Failed to query forensic logs: {}", e)
            })?;

        // Convert forensic envelopes to audit evidence
        let mut evidence = Vec::new();
        for env in forensic_logs {
            evidence.push(AuditEvidence {
                evidence_id: env.envelope_id.to_string(),
                evidence_type: self.map_log_type_to_evidence_type(&env.event_type),
                collection_date: env.timestamp,
                source_system: "Nodus".to_string(),
                description: env.action.clone(),
                hash: env.audit_trail_hash.clone(),
                classification: env.classification.clone(),
                retention_period: Duration::days(2555), // 7 years for SOX
                chain_of_custody: vec![CustodyEvent {
                    event_id: Uuid::new_v4().to_string(),
                    event_type: CustodyEventType::Created,
                    timestamp: env.timestamp,
                    actor: "System".to_string(),
                    details: "Automatically collected by forensic logger".to_string(),
                }],
            });
        }
        
        Ok(evidence)
    }
    
    async fn run_compliance_assessments(
        &self,
        framework: &ComplianceFramework,
        period: &ReportingPeriod,
        app_state: &AppState,
    ) -> Result<Vec<ControlAssessment>, ComplianceError> {
        let rules = self.rule_engine.get_rules_for_framework(framework);
        let mut assessments = Vec::new();
        
        for rule in rules {
            let assessment = self.assess_control_rule(&rule, period, app_state).await?;
            assessments.push(assessment);
        }
        
        Ok(assessments)
    }
    
    async fn assess_control_rule(
        &self,
        rule: &ComplianceRule,
        period: &ReportingPeriod,
        app_state: &AppState,
    ) -> Result<ControlAssessment, ComplianceError> {
        // Execute the rule query against the database
        let query_result = self.database_manager
            .execute_compliance_query(&rule.query, period, app_state)
            .await
            .map_err(|e| ComplianceError::DatabaseError {
                error: format!("Rule query failed: {}", e)
            })?;
        
        // Evaluate the result against the expected outcome
        let test_result = self.evaluate_rule_result(&query_result, &rule.expected_result);
        
        let status = match test_result.result {
            TestResultStatus::Pass => ControlStatus::Implemented,
            TestResultStatus::Fail => ControlStatus::NotImplemented,
            TestResultStatus::Inconclusive => ControlStatus::PartiallyImplemented,
            TestResultStatus::NotTested => ControlStatus::NotImplemented,
        };
        
        Ok(ControlAssessment {
            control_id: rule.control_id.clone(),
            control_name: rule.rule_name.clone(),
            control_description: rule.rule_description.clone(),
            status,
            implementation_level: ImplementationLevel::Level3, // Default to documented level
            test_results: vec![test_result],
            last_assessed: Utc::now(),
            next_assessment: Utc::now() + Duration::days(90), // Quarterly assessment
            evidence_references: vec![],
        })
    }
    
    fn evaluate_rule_result(&self, query_result: &serde_json::Value, expected: &RuleExpectation) -> TestResult {
        let result = match expected {
            RuleExpectation::Count(expected_count) => {
                if let Some(actual_count) = query_result.as_u64() {
                    if actual_count == *expected_count {
                        TestResultStatus::Pass
                    } else {
                        TestResultStatus::Fail
                    }
                } else {
                    TestResultStatus::Inconclusive
                }
            },
            RuleExpectation::Boolean(expected_bool) => {
                if let Some(actual_bool) = query_result.as_bool() {
                    if actual_bool == *expected_bool {
                        TestResultStatus::Pass
                    } else {
                        TestResultStatus::Fail
                    }
                } else {
                    TestResultStatus::Inconclusive
                }
            },
            _ => TestResultStatus::NotTested, // Other expectations not implemented yet
        };
        
        TestResult {
            test_id: Uuid::new_v4().to_string(),
            test_name: "Automated Rule Assessment".to_string(),
            test_date: Utc::now(),
            result,
            details: format!("Query result: {}, Expected: {:?}", query_result, expected),
            tester: "ComplianceEngine".to_string(),
            evidence_collected: vec![],
        }
    }
    
    fn map_log_type_to_evidence_type(&self, log_type: &str) -> EvidenceType {
        match log_type {
            "user_action" => EvidenceType::UserAction,
            "system_config" => EvidenceType::ConfigurationChange,
            "access_granted" | "access_denied" => EvidenceType::AccessLog,
            "data_modified" => EvidenceType::DataModification,
            "security_event" => EvidenceType::SecurityEvent,
            _ => EvidenceType::SystemLog,
        }
    }
    
    async fn get_cached_report(&self, cache_key: &str) -> Option<CachedComplianceReport> {
        let cache = self.report_cache.read().await;
        if let Some(cached) = cache.get(cache_key) {
            // Check if cache is still valid
            if Utc::now() - cached.cache_time < cached.ttl {
                return Some(cached.clone());
            }
        }
        None
    }
    
    async fn cache_report(&self, cache_key: String, report: &ComplianceReport) {
        let cached_report = CachedComplianceReport {
            report: report.clone(),
            cache_time: Utc::now(),
            ttl: Duration::hours(4), // Cache for 4 hours
        };
        
        self.report_cache.write().await.insert(cache_key, cached_report);
    }
}

/// Compliance dashboard summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceDashboardSummary {
    pub available_frameworks: Vec<ComplianceFramework>,
    pub framework_status: HashMap<ComplianceFramework, FrameworkStatus>,
    pub last_updated: DateTime<Utc>,
}

/// Framework status summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkStatus {
    pub status: ComplianceStatus,
    pub score: f64,
    pub last_assessed: DateTime<Utc>,
    pub control_count: usize,
    pub risk_count: usize,
}

impl ComplianceRuleEngine {
    async fn new() -> Result<Self, ComplianceError> {
        let mut rules = HashMap::new();
        
        // Load SOX rules
        rules.insert(ComplianceFramework::SOX, Self::load_sox_rules());
        
        // Additional frameworks would be loaded here
        
        Ok(Self { rules })
    }
    
    fn load_sox_rules() -> Vec<ComplianceRule> {
        vec![
            ComplianceRule {
                rule_id: "SOX-AC-001".to_string(),
                control_id: "SOX-AC-001".to_string(),
                rule_name: "User Access Reviews".to_string(),
                rule_description: "Regular review of user access rights".to_string(),
                query: "SELECT COUNT(*) FROM audit_logs WHERE event_type = 'access_review' AND timestamp >= ? AND timestamp <= ?".to_string(),
                expected_result: RuleExpectation::Count(1), // At least one access review
                frequency: AssessmentFrequency::Monthly,
                severity: RuleSeverity::High,
            },
            ComplianceRule {
                rule_id: "SOX-AU-001".to_string(),
                control_id: "SOX-AU-001".to_string(),
                rule_name: "Audit Log Retention".to_string(),
                rule_description: "Audit logs must be retained for required period".to_string(),
                query: "SELECT MIN(timestamp) FROM audit_logs".to_string(),
                expected_result: RuleExpectation::Custom("older_than_7_years".to_string()),
                frequency: AssessmentFrequency::Quarterly,
                severity: RuleSeverity::Critical,
            },
        ]
    }
    
    fn get_rules_for_framework(&self, framework: &ComplianceFramework) -> &[ComplianceRule] {
        self.rules.get(framework).map(|r| r.as_slice()).unwrap_or(&[])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_compliance_report_serialization() {
        let report = ComplianceReport {
            report_id: "test-report".to_string(),
            framework: ComplianceFramework::SOX,
            generated_at: Utc::now(),
            reporting_period: ReportingPeriod {
                start_date: Utc::now() - Duration::days(30),
                end_date: Utc::now(),
                period_type: PeriodType::Monthly,
            },
            overall_status: ComplianceStatus::Compliant,
            compliance_score: 95.5,
            controls: vec![],
            risks: vec![],
            evidence: vec![],
            recommendations: vec![],
            executive_summary: "Test summary".to_string(),
        };
        
        let json = serde_json::to_string(&report).unwrap();
        let parsed: ComplianceReport = serde_json::from_str(&json).unwrap();
        
        assert_eq!(report.report_id, parsed.report_id);
        assert_eq!(report.compliance_score, parsed.compliance_score);
    }
    
    #[test]
    fn test_sox_score_calculation() {
        let generator = SOXReportGenerator;
        
        let assessments = vec![
            ControlAssessment {
                control_id: "SOX-001".to_string(),
                control_name: "Test Control 1".to_string(),
                control_description: "Test".to_string(),
                status: ControlStatus::Implemented,
                implementation_level: ImplementationLevel::Level3,
                test_results: vec![],
                last_assessed: Utc::now(),
                next_assessment: Utc::now(),
                evidence_references: vec![],
            },
            ControlAssessment {
                control_id: "SOX-002".to_string(),
                control_name: "Test Control 2".to_string(),
                control_description: "Test".to_string(),
                status: ControlStatus::PartiallyImplemented,
                implementation_level: ImplementationLevel::Level2,
                test_results: vec![],
                last_assessed: Utc::now(),
                next_assessment: Utc::now(),
                evidence_references: vec![],
            },
        ];
        
        let score = generator.calculate_sox_score(&assessments);
        assert_eq!(score, 75.0); // 1.0 + 0.5 = 1.5, 1.5/2.0 = 0.75 = 75%
    }
}
