# Nodus Developer & Security Mandates (v2.0)
## Unified Enterprise Observability & Security Framework

This document defines binding, enforceable development and security rules for the Nodus Total System Control Platform. It establishes the foundation for enterprise-grade observability, atomic-level system control, and defense-grade security across all components.

---

## Strategic Mission

Transform Nodus into **the most auditable, observable, and compliance-ready productivity platform** in the enterprise market, enabling $50K-200K annual enterprise contracts through:

- **🚀 Sub-1ms Performance Excellence** - O(1) optimizations across all system operations
- **🎛️ Total System Control** - Atomic-level policy control over all components
- **🛡️ Defense-Grade Security** - Zero-trust, audit-first, offline-capable architecture
- **⚡ Real-Time Optimization** - Automatic performance tuning and policy adaptation
- **🏢 Enterprise Compliance** - Automated SOX, HIPAA, GDPR compliance with real-time enforcement

---

# I. ARCHITECTURAL FOUNDATION MANDATES

## 1.1 The Unified System Control Principle

**The central architectural rule**: All system operations MUST be controlled by the Unified Policy Engine through the HybridStateManager. No component may operate outside this control framework.

### **1.1.1 Unified Policy Engine Authority**
- All system operations (metrics, cache, state, embeddings, services, memory, network) MUST be governed by policy rules
- Policy changes MUST take effect in real-time without application restarts
- Every policy decision MUST be automatically logged through the observability system
- Emergency system controls MUST be available for instant performance optimization

### **1.1.2 Performance-First Architecture**
**CRITICAL**: All system operations MUST achieve O(1) complexity where possible:

| Component | Current Performance | Target Performance | Optimization Strategy |
|-----------|-------------------|-------------------|---------------------|
| AsyncOrchestrator | 5-15ms overhead | <1ms overhead | Pre-computed plugin pipelines |
| QueryService | 10-50ms response | <5ms response | Inverted search index + caching |
| EmbeddingManager | 50-200ms similarity | <10ms similarity | Vector indexing (HNSW/LSH) |
| MetricsRegistry | 1-3ms per operation | <0.1ms per operation | Batch aggregation + lazy cleanup |
| StateManager | 5-10ms per operation | <2ms per operation | Policy-driven caching |
| Cache Operations | 1-2ms | <0.1ms | Lazy TTL + scheduled cleanup |

**Enforcement**: Performance benchmarks MUST be validated in CI. Any regression >10% fails the build.

## 1.2 State Manager Single Source of Truth

**1.2.1 Central Authority**: The HybridStateManager is the ONLY source of truth for:
- Application state (entities, UI state, cache, metrics)
- Core functionality (storage, security, events, observability)
- Policy enforcement and system optimization
- Enterprise vs community feature gating

**1.2.2 No Direct Instantiation**: Core services are NEVER instantiated directly:

```javascript
// ✅ CORRECT: Services provided by state manager
const security = this.stateManager.securityManager;
const policies = this.stateManager.managers.policies;
const observability = this.stateManager.managers.observability;

// ❌ FORBIDDEN: Direct instantiation
import { SecurityManager } from '...'; 
const security = new SecurityManager();
```

**Applies to**: SecurityManager, MetricsRegistry, EventFlowEngine, ForensicLogger, ErrorHelpers, UnifiedPolicyEngine, SystemOptimizer, and ALL storage instances.

## 1.3 Enterprise License Enforcement

**1.3.1 Feature Separation**: Clean separation between community and enterprise capabilities:

| Feature Category | Community Access | Enterprise Access |
|------------------|------------------|-------------------|
| **Basic Hooks** | ✅ Full Access | ✅ Full Access |
| **Plugin Architecture** | ✅ Unsigned Only | ✅ Signed + Unsigned |
| **Performance Optimization** | ❌ None | ✅ O(1) Everything |
| **Policy Control** | ❌ None | ✅ Total System Control |
| **System Optimization** | ❌ None | ✅ Real-time Tuning |
| **Emergency Controls** | ❌ None | ✅ All Controls |
| **Compliance Automation** | ❌ None | ✅ SOX/HIPAA/GDPR |
| **Enterprise Dashboard** | ❌ None | ✅ Full Dashboard |

**1.3.2 License Validation**: All enterprise features MUST validate license before execution:

```javascript
// ✅ REQUIRED: License validation for enterprise features
if (!this.stateManager.license?.hasFeature('system_optimization')) {
    throw new Error('Enterprise license required for system optimization');
}
```

**1.3.3 Signed Plugin Architecture**: Enterprise plugins MUST be cryptographically signed:
- Community plugins: unsigned, basic execution
- Enterprise plugins: signed with validation, full system access
- Plugin manifests MUST include capability declarations
- Invalid signatures MUST be rejected immediately

---

# II. SECURITY & AUDITING MANDATES (NON-NEGOTIABLE)

Security is not a feature; it is the foundation. Bypassing these rules constitutes critical system failure.

## 2.1 Prohibited APIs & Practices (Build Failure)

| Category | Forbidden APIs | Rationale | ESLint Rule |
|----------|---------------|-----------|-------------|
| **Code Execution** | `eval`, `new Function`, `setTimeout('string')` | Arbitrary code injection | `copilotGuard/no-insecure-api` |
| **DOM Injection** | `innerHTML`, `outerHTML`, `insertAdjacentHTML` | XSS vector | `copilotGuard/no-insecure-api` |
| **Network** | `fetch`, `XMLHttpRequest` | Must use CDS transport | `nodus/require-cds-transport` |
| **Dynamic Imports** | `import(url)` unless local | Supply chain risk | `nodus/local-imports-only` |
| **Browser Storage** | `localStorage`, `sessionStorage` | Non-encrypted PII risk | `copilotGuard/no-insecure-api` |
| **External Scripts** | Unverified CDN content | Data exfiltration risk | `nodus/no-external-scripts` |

**Enforcement**: ALL violations trigger build failure. No exceptions.

## 2.2 Mandatory Security Controls

### **2.2.1 Automatic Observability Rule (O-01)**
**All operations MUST use automatic observability through the two execution gateways: AsyncOrchestrator (async) and ActionDispatcher (sync). Manual logging calls are prohibited in favor of transparent, policy-driven observability.**

```javascript
// ✅ REQUIRED: Automatic observability through AsyncOrchestrator (async operations)
const runner = this.stateManager.managers.asyncOrchestrator.createRunner('data_operation');
await runner.run(async () => {
    // Automatically instrumented based on policies
    return await processData(input);
});

// ✅ REQUIRED: Automatic observability through ActionDispatcher (sync operations)  
await this.stateManager.managers.actionDispatcher.dispatch('entity.update', {
    entityId: 'user-123',
    updates: { name: 'New Name' }
});
// ^ Automatically creates audit trails based on classification and policies

// ❌ FORBIDDEN: Manual logging calls
await this.stateManager.managers.forensicLogger.createEnvelope({...});
await this.stateManager.storage.put(key, entity);

// ❌ FORBIDDEN: Direct state mutations bypassing execution gateways
this.stateManager.storage.put(key, entity); // No observability
```

**Verified by**: `nodus/require-observability-compliance`

### **2.2.2 Async Orchestration Rule (A-02)**
**All asynchronous workflows MUST be executed through the centralized AsyncOrchestrator.**

```javascript
// ✅ REQUIRED: Orchestrated async operations
const runner = this.stateManager.managers.asyncOrchestrator.createRunner('data_operation');
await runner.run(async () => {
    // Your async operation here
    return await processData(input);
});

// ❌ FORBIDDEN: Raw async functions in production
async function processData(input) { /* ... */ }
```

**Verified by**: `nodus/require-async-orchestration`

### **2.2.3 Action Dispatcher Rule (S-03)**
**All synchronous operations and UI actions MUST be executed through the centralized ActionDispatcher for automatic observability.**

```javascript
// ✅ REQUIRED: Synchronous operations through ActionDispatcher
// UI actions automatically instrumented via data-action attributes
<button data-action="ui.toggleSidebar" data-context='{"panel": "left"}'>
    Toggle Sidebar
</button>

// Programmatic actions through ActionDispatcher
await this.stateManager.managers.actionDispatcher.dispatch('ui.updateEntity', {
    entityId: 'user-123',
    updates: { name: 'New Name' },
    actor: this.context.userId
});

// ❌ FORBIDDEN: Direct state mutations bypassing ActionDispatcher
this.stateManager.storage.put('entities.user-123', updatedUser); // No observability
```

**ActionDispatcher automatically provides:**
- **Audit trails** for all state mutations based on classification
- **Performance metrics** for action execution timing
- **Policy compliance** checks before action execution
- **Error tracking** and recovery for failed actions

**Verified by**: `nodus/require-action-dispatcher`

### **2.2.4 Policy-Controlled Operations (P-04)**
**ALL system operations MUST respect policy controls and performance optimization rules.**

```javascript
// ✅ REQUIRED: Policy-aware operations with automatic instrumentation
const policies = this.stateManager.managers.policies;
const metricsEnabled = policies.getPolicy('observability', 'metrics_enabled');
const performanceProfile = policies.getPolicy('system', 'performance_profile');

// Policy-controlled behavior - metrics automatically tracked by orchestrator
if (performanceProfile === 'ultra_fast') {
    // Skip non-critical operations - observability still automatic
    return await this.optimizedPath(data);
}

// Standard path - all operations automatically instrumented
return await this.standardPath(data);
```

**Verified by**: `nodus/require-policy-compliance`

### **2.2.5 Constant-Time Cryptographic Operations (C-05)**
**All MAC and classification comparisons MUST use constant-time functions.**

```javascript
// ✅ REQUIRED: Constant-time comparisons
import { constantTimeCheck } from '@shared/security/ct.js';

const isValid = await constantTimeCheck(async () => {
    return crypto.subtle.verify('HMAC', key, signature, data);
}, 100); // Minimum 100ms padding

// ❌ FORBIDDEN: Direct timing-vulnerable comparisons
const isValid = (signature === expectedSignature);
```

**Verified by**: Security integration tests

## 2.3 Import Canonicalization & Dependencies

### **2.3.1 Canonical Imports Only (I-03)**
**Every import MUST use approved aliases or explicit relative paths with extensions.**

```javascript
// ✅ CORRECT: Canonical aliases and explicit paths
import { SafeDOM } from "@shared/lib/SafeDOM.js";
import { PolicyEngine } from "@platform/policy/UnifiedPolicyEngine.js";
import createRunner from "../../async/create-runner.js";

// ❌ FORBIDDEN: Legacy barrels and shim aliases
import SafeDOM from "@core/SafeDOM";
import runner from "../../async"; // missing extension
import { PolicyEngine } from "@core/policy"; // index barrel
```

**Verified by**: `nodus/prefer-alias-imports`

### **2.3.2 Zero Runtime Dependencies (S-05)**
**Only @core/* imports and native Web APIs are allowed at runtime.**

- Production: Only `@core/*`, `@shared/*`, `@platform/*` imports and native APIs
- Development: `vitest`, `playwright`, `eslint` permitted
- **FORBIDDEN**: Any external runtime dependencies
- **REQUIRED**: Internal DateUtils MUST replace date-fns completely

**Verified by**: `copilotGuard/no-runtime-dependencies`

---

# III. PERFORMANCE & OPTIMIZATION MANDATES

## 3.1 Performance Budgets (CI-Enforced)

### **3.1.1 Strict Performance Targets**
```javascript
// Performance SLA Requirements (CI-validated)
const PERFORMANCE_TARGETS = {
    bundleSize: '50KB gzipped',           // Maximum bundle size
    systemOverhead: '1ms',                // Maximum system operation overhead
    queryResponse: '5ms offline / 50ms online', // Query response times
    stateOperation: '2ms',                // State management operations
    cacheOperation: '0.1ms',              // Cache get/set operations
    policyEvaluation: '0.5ms',           // Policy rule evaluation
    forensicLogging: '1ms',              // Forensic envelope creation
    enterpriseDashboard: '100ms initial', // Dashboard load time
};
```

**Enforcement**: Performance regression >10% fails CI build.

### **3.1.2 Memory Budget Enforcement**
```javascript
// Memory budget guidelines (enforced in CI)
const MEMORY_BUDGETS = {
    gridSystem: '10MB heap resident',
    cacheManager: '50MB total cache',
    metricsRegistry: '5MB metric storage',
    forensicLogger: '20MB log buffer',
    embeddingManager: '100MB vector cache',
    stateManager: '25MB application state'
};
```

## 3.2 Optimization Requirements

### **3.2.1 All Caches MUST be Bounded**
**Unbounded caches are memory leaks. All caches MUST use bounded strategies.**

```javascript
// ✅ REQUIRED: Bounded cache with policy control
const cache = new PolicyControlledLRUCache({
    maxSize: this.stateManager.managers.policies.getPolicy('cache', 'max_size'),
    ttl: this.stateManager.managers.policies.getPolicy('cache', 'default_ttl'),
    metrics: this.stateManager.metricsRegistry.namespace('cache')
});

// ❌ FORBIDDEN: Unbounded cache
const cache = new Map(); // No size limit
```

### **3.2.2 No String Parsing in Hot Paths**
**Pre-parse data once, use computed results at runtime.**

```javascript
// ✅ CORRECT: Pre-parsed data structures
class DateConditions {
    static parseTimeString(timeStr) {
        // Parse once, cache result
        return this.#timeCache.computeIfAbsent(timeStr, () => parseTime(timeStr));
    }
}

// ❌ FORBIDDEN: Parsing in render loops
function evaluateTimeCondition(timeStr) {
    return parseTime(timeStr); // Called repeatedly
}
```

### **3.2.3 Metrics are Mandatory**
**Performance-critical features MUST report metrics.**

```javascript
// ✅ REQUIRED: Automatic metrics through orchestrator for performance-critical operations
async renderGrid() {
    // Method automatically instrumented by orchestrator - no manual metrics calls
    const runner = this.stateManager.managers.asyncOrchestrator.createRunner('grid.render');
    
    return await runner.run(async () => {
        // All metrics, timing, and error tracking handled automatically
        return await this.doRender();
    });
}

// Alternative: For synchronous operations, automatic through decorators
@automaticObservability('grid.render')
renderGridSync() {
    // Automatic metrics collection, no manual calls required
    return this.doRenderSync();
}
```

---

# IV. ENTERPRISE OBSERVABILITY ARCHITECTURE

## 4.1 Unified Policy Engine Requirements

### **4.1.1 Total System Control**
**The Unified Policy Engine MUST provide atomic-level control over ALL system operations.**

```javascript
// Policy configuration for enterprise tenants
const enterprisePolicies = {
    // Performance optimization policies
    'system.performance_profile': 'ultra_fast',
    'metrics.collection_level': 'enterprise',
    'cache.strategy': 'aggressive',
    'async.execution_mode': 'parallel',
    
    // Security and compliance policies
    'forensic.depth': 'full',
    'compliance.frameworks': ['SOX', 'HIPAA', 'GDPR'],
    'audit.retention_period': '7_years',
    'classification.default_level': 'internal',
    
    // Component-specific policies
    'metrics.timer.trading_operations.*': false,     // No timer overhead
    'cache.set.market_data.*': { type: 'aggressive' },
    'async.plugin_execution.*.*': { type: 'parallel' },
    'embedding.generation.batch_size': 1000,
    'network.request.timeout': 5000
};
```

### **4.1.2 Real-Time Policy Updates**
**Policy changes MUST take effect immediately without application restart.**

```javascript
// ✅ REQUIRED: Real-time policy application
class UnifiedPolicyEngine {
    async updatePolicy(domain, key, value, context) {
        // Validate policy change
        await this.validatePolicyChange(domain, key, value, context);
        
        // Automatic audit logging through policy engine instrumentation
        // (no manual logging calls - handled by policy engine automatically)
        
        // Apply policy immediately
        this.setPolicyImmediate(domain, key, value);
        
        // Notify all components
        this.eventBus.emit('policy.changed', { domain, key, value });
    }
}
```

## 4.2 Comprehensive System Observability

### **4.2.1 Zero-Blind-Spot Architecture**
**Every operation across ALL system boundaries MUST be observable and controllable.**

```javascript
// Internal observability system implementation (not developer code)
// This shows how automatic observability works internally
class ObservableOperation {
    async execute(operation, context) {
        const operationId = this.generateOperationId();
        const policies = this.stateManager.managers.policies;
        
        // Policy-driven observability decisions
        const observabilityLevel = policies.getPolicy('observability', 'level');
        const metricsEnabled = policies.getPolicy('metrics', 'enabled');
        const forensicDepth = policies.getPolicy('forensic', 'depth');
        
        // Automatic observability start (internal system code)
        if (metricsEnabled) {
            this.metrics.startTimer(operationId);
        }
        
        try {
            const result = await operation();
            
            // Automatic success tracking (internal system code)
            if (metricsEnabled) {
                this.metrics.recordSuccess(operationId);
            }
            
            return result;
        } catch (error) {
            // Automatic error tracking (internal system code)
            if (metricsEnabled) {
                this.metrics.recordError(operationId, error);
            }
            
            if (forensicDepth >= 'basic') {
                await this.forensicLogger.logOperationError(operationId, error);
            }
            
            throw error;
        }
    }
}
```

### **4.2.2 Enterprise Dashboard Integration**
**Real-time system monitoring and control through enterprise dashboard.**

```javascript
// Enterprise dashboard data provider
class SystemControlDashboard {
    async getSystemMetrics(tenantId) {
        if (!this.license.hasFeature('enterprise_dashboard')) {
            throw new Error('Enterprise license required');
        }
        
        return {
            performance: await this.getPerformanceMetrics(tenantId),
            policies: await this.getPolicyStatus(tenantId),
            compliance: await this.getComplianceMetrics(tenantId),
            security: await this.getSecurityEvents(tenantId),
            optimization: await this.getOptimizationStatus(tenantId)
        };
    }
    
    async emergencySystemControl(action, tenantId) {
        // Automatic audit logging through enterprise system control
        // (observability handled automatically by enterprise dashboard)
        
        switch (action) {
            case 'MAXIMUM_PERFORMANCE':
                await this.optimizeForPerformance(tenantId);
                break;
            case 'MAXIMUM_SECURITY':
                await this.optimizeForSecurity(tenantId);
                break;
            case 'COMPLIANCE_MODE':
                await this.enableComplianceMode(tenantId);
                break;
        }
    }
}
```

---

# V. CODE QUALITY & STRUCTURE MANDATES

## 5.1 Modern JavaScript Requirements

### **5.1.1 Private Fields are LAW**
**All internal class properties and methods MUST use # prefix.**

```javascript
// ✅ CORRECT: Private fields at top, proper encapsulation
class PolicyEngine {
    #policies = new Map();
    #eventBus;
    #forensicLogger;
    #metricsRegistry;
    
    constructor(dependencies) {
        this.#eventBus = dependencies.eventBus;
        this.#forensicLogger = dependencies.forensicLogger;
        this.#metricsRegistry = dependencies.metricsRegistry;
    }
    
    #validatePolicy(domain, key, value) {
        // Private implementation
    }
    
    getPolicy(domain, key) {
        return this.#policies.get(`${domain}.${key}`);
    }
}

// ❌ FORBIDDEN: Public fields, underscore convention
class PolicyEngine {
    constructor() {
        this._policies = new Map(); // Wrong: underscore convention
        this.eventBus = null;       // Wrong: should be private
    }
}
```

### **5.1.2 JSDoc is Mandatory**
**Every exported function, class, and public method MUST have complete JSDoc.**

```javascript
/**
 * Unified Policy Engine for enterprise system control
 * @class UnifiedPolicyEngine
 * @description Provides atomic-level policy control over all system operations
 * with real-time updates and forensic logging
 */
export class UnifiedPolicyEngine {
    /**
     * Updates a policy value with immediate effect
     * @param {string} domain - Policy domain (e.g., 'system', 'metrics', 'cache')
     * @param {string} key - Policy key within domain
     * @param {any} value - New policy value
     * @param {object} context - Request context with user info
     * @param {string} context.userId - ID of user making change
     * @param {string} context.tenantId - Tenant ID for multi-tenant isolation
     * @returns {Promise<void>}
     * @throws {PolicyValidationError} When policy value is invalid
     * @throws {PermissionError} When user lacks policy update permission
     */
    async updatePolicy(domain, key, value, context) {
        // Implementation
    }
}
```

**Verified by**: `copilotGuard/require-jsdoc-and-tests`

### **5.1.3 Strict ES2022+ Standards**
- `var` is forbidden - use `const` preferred over `let`
- `async/await` preferred over Promise chains
- ES Modules (`import/export`) required
- Modern syntax (destructuring, optional chaining, nullish coalescing)

---

# VI. ENFORCEMENT MECHANISMS

## 6.1 ESLint Configuration (Flat Config)

```javascript
// eslint.config.js
import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["**/*.js", "**/*.mjs"],
        languageOptions: { 
            ecmaVersion: "latest", 
            sourceType: "module" 
        },
        plugins: {
            nodus: await import("./tools/eslint-plugin-nodus/index.js"),
            copilotGuard: await import("./tools/eslint-plugin-copilot-guard/index.js"),
        },
        rules: {
            // Security rules (fail build)
            "no-eval": "error",
            "no-implied-eval": "error", 
            "no-new-func": "error",
            "copilotGuard/no-insecure-api": "error",
            
            // Architecture rules
            "nodus/no-direct-core-instantiation": "error",
            "nodus/require-async-orchestration": "error",
            "nodus/require-action-dispatcher": "error",
            "nodus/prefer-alias-imports": "error",
            "nodus/require-observability-compliance": "error",
            "nodus/require-policy-compliance": "error",
            "nodus/require-cds-transport": "error",
            
            // Quality rules
            "copilotGuard/require-jsdoc-and-tests": "error",
            "copilotGuard/no-runtime-dependencies": "error",
        }
    }
];
```

## 6.2 CI/CD Security Gates

### **6.2.1 Pre-commit Hooks**
```bash
#!/usr/bin/env bash
# .husky/pre-commit
set -euo pipefail

echo "🔍 Running security scans..."
npx eslint . --ext .js,.mjs
node scripts/ci/security-scan.js
node scripts/ci/performance-check.js
node scripts/ci/jsdoc-validation.js

echo "🧪 Running security tests..."
npm run test:security

echo "📊 Validating performance budgets..."
npm run test:performance

echo "✅ All security and performance checks passed"
```

### **6.2.2 Performance Budget Validation**
```javascript
// scripts/ci/performance-check.js
import { performance } from 'perf_hooks';

const PERFORMANCE_BUDGETS = {
    'AsyncOrchestrator.run': 1,           // 1ms max
    'QueryService.search': 5,             // 5ms max
    'EmbeddingManager.findSimilar': 10,   // 10ms max
    'MetricsRegistry.increment': 0.1,     // 0.1ms max
    'PolicyEngine.getPolicy': 0.5,       // 0.5ms max
};

// Run performance benchmarks and fail if budgets exceeded
for (const [operation, budget] of Object.entries(PERFORMANCE_BUDGETS)) {
    const actualTime = await benchmarkOperation(operation);
    if (actualTime > budget) {
        console.error(`❌ Performance budget exceeded: ${operation} took ${actualTime}ms (budget: ${budget}ms)`);
        process.exit(1);
    }
}
```

## 6.3 License Enforcement

### **6.3.1 Feature Gate Implementation**
```javascript
// Platform feature gate decorator
function requiresEnterpriseLicense(feature) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            const license = this.stateManager?.license;
            
            if (!license?.hasFeature(feature)) {
                // License violation automatically logged by enterprise system
                // (no manual logging - handled by license validation system)
                
                throw new LicenseError(`Enterprise license required for feature: ${feature}`);
            }
            
            return originalMethod.apply(this, args);
        };
        
        return descriptor;
    };
}

// Usage example
class SystemOptimizer {
    @requiresEnterpriseLicense('system_optimization')
    async optimizePerformance(tenantId) {
        // Enterprise-only optimization logic
    }
}
```

---

# VII. COMPLIANCE & AUDIT REQUIREMENTS

## 7.1 Regulatory Framework Compliance

### **7.1.1 Automated Compliance Enforcement**
**The system MUST automatically enforce compliance policies for SOX, HIPAA, and GDPR.**

```javascript
// Compliance policy engine
class ComplianceEngine {
    #frameworks = {
        SOX: {
            auditRetention: '7_years',
            signatureRequired: true,
            immutableLogs: true,
            accessControls: 'strict'
        },
        HIPAA: {
            dataEncryption: 'required',
            accessLogging: 'detailed',
            dataRetention: 'patient_specific',
            breachNotification: 'automatic'
        },
        GDPR: {
            dataMinimization: true,
            rightToErasure: true,
            consentManagement: true,
            dataPortability: true
        }
    };
    
    async enforceCompliance(operation, data, context) {
        const frameworks = this.getApplicableFrameworks(context.tenantId);
        
        for (const framework of frameworks) {
            await this.validateComplianceRequirements(framework, operation, data);
        }
        
        return await this.executeWithCompliance(operation, data, frameworks);
    }
}
```

## 7.2 Automatic Audit Trail

### **7.2.1 Immutable Audit Chain Structure**
**Every auditable event automatically creates a signed, hash-chained audit envelope through the observability system.**

```javascript
// Audit envelope structure (automatically created by observability system)
const auditEnvelope = {
    id: generateUUID(),
    timestamp: getMonotonicTimestamp(),
    actor_id: context.userId,
    action: 'entity.update',
    object_ref: entity.id,
    classification: entity.classification,
    hash_prev: this.getLastEnvelopeHash(),
    hash_current: null, // Computed after envelope creation
    signature: null,    // Computed after hash
    signature_algorithm: 'ECDSA-P256',
    payload: {
        old_value: sanitizeForAudit(oldValue),
        new_value: sanitizeForAudit(newValue),
        metadata: operation.metadata
    }
};

// Note: Developers never create these manually - they're generated automatically
// by the AsyncOrchestrator, ActionDispatcher, and storage adapters based on policy configuration
```

### **7.2.2 Non-Repudiation Requirements**
- **Signatures**: ECDSA-P256 or Ed25519 only
- **Timestamps**: Trusted monotonic clock or TSA
- **Anchoring**: Daily anchor hash to verifiable ledger
- **Integrity**: Hash chain validation on every access

---

# VIII. AI AGENT RESPONSIBILITIES

## 8.1 Copilot Compliance Framework

### **8.1.1 Mandatory AI Compliance Rules**
**AI tools (Copilot, etc.) MUST operate in "compliance-first" mode:**

1. **Never suggest prohibited APIs** from Section 2.1
2. **Always wrap async operations** with AsyncOrchestrator
3. **Always use ActionDispatcher** for synchronous operations and state mutations
4. **Use canonical imports only** with proper extensions
5. **Use automatic observability** through execution gateways and policy compliance
6. **Respect license gates** for enterprise features
7. **Generate JSDoc** for all exported functions
8. **Follow performance budgets** in all code suggestions

### **8.1.2 AI Code Generation Standards**
```javascript
// ✅ AI-generated code MUST follow this pattern
/**
 * AI-generated function with proper documentation
 * @param {object} data - Input data for processing
 * @returns {Promise<object>} Processed result
 */
export async function processData(data) {
    // REQUIRED: Policy compliance check
    const policies = this.stateManager.managers.policies;
    if (!policies.getPolicy('processing', 'enabled')) {
        throw new Error('Data processing disabled by policy');
    }
    
    // REQUIRED: Async orchestration with automatic observability
    const runner = this.stateManager.managers.asyncOrchestrator.createRunner('data_processing');
    
    return await runner.run(async () => {
        // All metrics, audit logs, and observability handled automatically
        // by the orchestrator based on policy configuration
        return await this.#processDataInternal(data);
    });
}
```

---

# IX. CERTIFICATION & VALIDATION

## 9.1 Security Certification Alignment

This framework aligns with:
- **NIST SP 800-53 (Rev.5)** - AC, AU, SC, SI control families
- **ISO/IEC 27001:2022** - A.8, A.9, A.12 controls  
- **NATO AC/322-D/2004-REV2** - Multilevel security operations
- **ITAR/EAR Part 744** - Controlled data handling
- **SOX Section 404** - Internal controls over financial reporting
- **HIPAA Security Rule** - Administrative, physical, technical safeguards

## 9.2 Continuous Validation

### **9.2.1 Automated Security Testing**
```javascript
// Security test suite (runs on every PR)
describe('Security Compliance', () => {
    test('No prohibited APIs in production code', async () => {
        const violations = await scanForProhibitedAPIs('./src');
        expect(violations).toHaveLength(0);
    });
    
    test('All operations use automatic observability', async () => {
        const operations = await findObservableOperations('./src');
        for (const operation of operations) {
            const usesAutomaticObservability = await checkObservabilityCompliance(operation);
            expect(usesAutomaticObservability).toBe(true);
        }
    });
    
    test('Performance budgets maintained', async () => {
        const benchmarks = await runPerformanceBenchmarks();
        for (const [operation, time] of Object.entries(benchmarks)) {
            const budget = PERFORMANCE_BUDGETS[operation];
            expect(time).toBeLessThan(budget);
        }
    });
});
```

---

# X. IMPLEMENTATION TIMELINE

## Phase 1: Foundation (Weeks 1-4)
- [ ] Unified Policy Engine implementation
- [ ] Performance optimization framework  
- [ ] License enforcement system
- [ ] Updated ESLint rules and CI gates

## Phase 2: Enterprise Features (Weeks 5-8)
- [ ] Signed plugin architecture
- [ ] Real-time system optimization
- [ ] Enterprise dashboard integration
- [ ] Compliance automation

## Phase 3: Validation (Weeks 9-12)
- [ ] Performance benchmark validation
- [ ] Security certification testing
- [ ] Enterprise design partner validation
- [ ] Documentation and training

---

# XI. DEVELOPER ONBOARDING

## Quick Start Checklist

1. **Review this document completely** - Understanding is mandatory
2. **Install development tools**: ESLint, Husky, performance validators
3. **Run security scan**: `npm run security:check`
4. **Validate performance**: `npm run performance:benchmark`
5. **Test forensic logging**: Enable dev HUD with `?hud=1`
6. **Practice policy compliance**: Review policy engine documentation
7. **Understand license gates**: Test enterprise feature restrictions

## Development Workflow

1. **Before coding**: Identify applicable policies and license requirements
2. **During coding**: Follow architectural mandates and security rules
3. **Before commit**: Run all validation scripts and tests
4. **After commit**: Monitor CI for security and performance validation

---

**This unified framework establishes Nodus as the most secure, observable, and controllable enterprise platform available, enabling significant competitive advantage while maintaining rigorous security and compliance standards.**

**Version**: 2.0  
**Effective Date**: 2025-11-03  
**Next Review**: 2025-12-03  
**Compliance Level**: Defense Grade + Enterprise Ready
