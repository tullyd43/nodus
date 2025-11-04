# Nodus Developer Migration & Onboarding Guide

> **Enterprise Observability Platform with Rigorous Security Standards**
> 
> This guide helps developers understand Nodus architecture, security mandates, and migration patterns for maintaining the highest security and observability standards.

## 🚀 Quick Start

### Development Commands
```bash
# Development server
npm run dev

# Strict linting (MUST pass for commits)
npm run lint:strict

# Unit tests
npm run test:run

# Full validation (lint + tests + security scan)
npm run validate
```

### Core Architecture Overview
```
User Interface     → ActionDispatcher (DOM events → UI actions)
Application Flow   → EventFlowEngine (workflows & business logic)  
Infrastructure     → AsyncOrchestrator (performance & reliability)
Domain Security    → ForensicRegistry (compliance & MAC security)
Core Operations    → Raw APIs (storage, cache, network, etc.)
```

---

## 🏗️ Three Architectural Patterns: When and How

### 1. 🖱️ ActionDispatcher: UI Events → State Mutations

**Purpose**: User-initiated actions that modify application state.

**When to Use:**
- Button clicks, form submissions
- UI state changes (toggle, show/hide)
- Entity CRUD operations triggered by users
- Any state mutation from UI interaction

**Code Patterns:**
```javascript
// ✅ Declarative HTML actions (preferred)
<button data-action="entity.delete" data-entity="123">Delete</button>
<form data-action="entity.save" data-action-payload='{"type": "user"}'>

// ✅ Programmatic dispatch
await actionDispatcher.dispatch('entity.update', {
    entityId: '123',
    updates: { name: 'New Name' },
    actor: currentUser.id
});
```

**What it provides:**
- Automatic audit trails for state changes
- User context tracking (who did what)
- Policy compliance checks
- Integration with EventFlowEngine for workflows

### 2. ⚡ AsyncOrchestrator: Performance & Reliability

**Purpose**: Wrap any async operation for performance tracking and reliability.

**When to Use:**
- Background processing, batch operations
- API calls, network requests
- Database operations, complex computations  
- Any async operation needing retry logic or metrics

**Code Patterns:**
```javascript
// ✅ Create runner for operation
const runner = orchestrator.createRunner('data_processing');
await runner.run(async () => {
    return await processLargeDataset(input);
}, {
    label: 'user.data.processing',
    retries: 3,
    timeout: 30000
});

// ✅ Performance budget annotations
/* PERFORMANCE_BUDGET: 10ms */
const result = await runner.run(fastOperation);
```

**What it provides:**
- Performance metrics and timing
- Circuit breakers and retry logic
- Resource monitoring
- Operation lifecycle tracking

### 3. 🛡️ ForensicRegistry: Domain Security & Compliance

**Purpose**: Security-sensitive operations requiring MAC enforcement and audit compliance.

**When to Use:**
- Cache operations (reads/writes need polyinstantiation)
- Storage operations with classified data
- API calls to external systems
- Authentication/authorization operations
- Any operation requiring security classification

**Code Patterns:**
```javascript
// ✅ Cache operations with security
await forensicRegistry.wrapOperation('cache', 'get',
    () => cache.get(id),
    {
        cache: 'embeddings',
        key: id,
        requester: currentUser.id,
        classification: 'CONFIDENTIAL'
    }
);

// ✅ Storage operations with MAC enforcement
await forensicRegistry.wrapOperation('storage', 'put',
    () => storage.put('objects', sensitiveData),
    {
        store: 'objects',
        classification: 'SECRET',
        compartments: ['project_alpha'],
        requester: currentUser.id
    }
);
```

**What it provides:**
- MAC (Mandatory Access Control) enforcement
- Polyinstantiation (different data for different clearance levels)
- Complete forensic audit trails
- License tier enforcement
- Domain-specific security logic

---

## 🔒 Security Mandates (CRITICAL - ZERO TOLERANCE)

### Mandate 1: No Direct Core Instantiation
```javascript
// ❌ FORBIDDEN - Direct instantiation
const security = new SecurityManager();
const metrics = new MetricsRegistry();

// ✅ REQUIRED - Through StateManager
const security = stateManager.managers.security;
const metrics = stateManager.managers.metricsRegistry;
```

**ESLint Rule**: `nodus/no-direct-core-instantiation`

### Mandate 2: All Async Operations Through Orchestrator
```javascript
// ❌ FORBIDDEN - Raw async functions
async function processData(input) {
    return await heavyComputation(input);
}

// ✅ REQUIRED - Orchestrated async operations
const runner = orchestrator.createRunner('data_processing');
await runner.run(async () => {
    return await heavyComputation(input);
});
```

**ESLint Rule**: `nodus/require-async-orchestration`

### Mandate 3: All State Mutations Through ActionDispatcher
```javascript
// ❌ FORBIDDEN - Direct state mutation
stateManager.storage.put('entities.user-123', userData);

// ✅ REQUIRED - Through ActionDispatcher
await actionDispatcher.dispatch('entity.save', {
    entityId: 'user-123',
    data: userData,
    actor: currentUser.id
});
```

**ESLint Rule**: `nodus/require-action-dispatcher`

### Mandate 4: No Direct DOM Access
```javascript
// ❌ FORBIDDEN - Direct DOM manipulation
document.getElementById('sidebar').style.display = 'none';
window.localStorage.setItem('user', userData);

// ✅ REQUIRED - Declarative actions or SafeDOM
<button data-action="ui.toggleSidebar">Toggle</button>
// OR: Use SafeDOM utilities for necessary DOM access
```

**ESLint Rule**: `nodus/no-direct-dom-access`

### Mandate 5: No External Scripts/APIs Without CDS Transport
```javascript
// ❌ FORBIDDEN - Direct fetch calls
const response = await fetch('https://api.external.com/data');

// ✅ REQUIRED - CDS Transport
const response = await CDS.fetch('https://api.external.com/data', {
    transport: 'secure',
    audit: true
});
```

**ESLint Rule**: `nodus/require-cds-transport`

### Mandate 6: Enterprise Features Require License Validation
```javascript
// ❌ FORBIDDEN - Direct enterprise feature usage
systemOptimizer.enableMaxPerformance();

// ✅ REQUIRED - License validation first
if (license.hasFeature('performance_optimization')) {
    systemOptimizer.enableMaxPerformance();
} else {
    throw new Error('Enterprise license required');
}
```

**ESLint Rule**: `nodus/require-license-validation`

### Mandate 7: All Plugins Must Be Signed (Enterprise+)
```javascript
// ❌ FORBIDDEN - Unsigned enterprise plugins
pluginRegistry.register('my-plugin', unsignedPlugin);

// ✅ REQUIRED - Signature validation
await pluginRegistry.registerSignedPlugin('my-plugin', plugin, signature);
```

**ESLint Rule**: `nodus/require-signed-plugins`

---

## 🎫 License Tier Architecture

### Consumer Tier (Open Source)
**Features**: Basic observability and security
**Plugins**: 9 core forensic plugins
```javascript
// Available forensic plugins
const consumerPlugins = [
    'storage', 'security', 'auth', 'api', 'plugins',
    'config', 'policy', 'service', 'ui'
];

// Basic license check
if (license.tier === 'consumer') {
    // Consumer features only
}
```

### Enterprise Tier (Business License)
**Features**: Full business observability, advanced analytics
**Plugins**: 19 plugins (consumer + 10 business)
```javascript
// Additional enterprise plugins
const enterprisePlugins = [
    'database', 'network', 'sync', 'files', 'i18n',
    'search', 'embeddings', 'ai', 'jobs', 'health'
];

// Enterprise feature gates
if (license.hasFeature('advanced_forensics')) {
    forensicLogger.enableFullAuditTrail();
}

if (license.hasFeature('system_optimization')) {
    systemOptimizer.enableRealTimeOptimization();
}
```

### Defense Tier (Government/Classified)
**Features**: Classified operations, NATO compliance
**Plugins**: 20 plugins (enterprise + 1 classified)
```javascript
// Defense-only plugins
const defensePlugins = ['crypto']; // Classified crypto operations

// NATO/Defense feature gates
if (license.hasFeature('classified_operations')) {
    cryptoPlugin.enableClassifiedEncryption();
}

if (license.hasFeature('nato_compliance')) {
    complianceEngine.enableNATOMode();
}
```

---

## 🛠️ Migration Patterns

### Pattern 1: Migrating Direct Service Instantiation
```javascript
// BEFORE (Legacy)
class MyService {
    constructor() {
        this.security = new SecurityManager();
        this.metrics = new MetricsRegistry();
    }
}

// AFTER (Nodus Compliant)
class MyService {
    constructor({ stateManager }) {
        this.stateManager = stateManager;
        this.security = stateManager.managers.security;
        this.metrics = stateManager.managers.metricsRegistry;
    }
}
```

### Pattern 2: Migrating Raw Async Operations
```javascript
// BEFORE (Legacy)
class DataProcessor {
    async processData(data) {
        const result = await heavyComputation(data);
        this.metrics.timer('processing.duration', processingTime);
        return result;
    }
}

// AFTER (Nodus Compliant)
class DataProcessor {
    constructor({ stateManager }) {
        this.orchestrator = stateManager.managers.asyncOrchestrator;
    }
    
    async processData(data) {
        const runner = this.orchestrator.createRunner('data.processing');
        return await runner.run(async () => {
            // Metrics automatically tracked by orchestrator
            return await heavyComputation(data);
        }, {
            label: 'data.heavy.computation',
            timeout: 30000
        });
    }
}
```

### Pattern 3: Migrating Direct DOM Manipulation
```javascript
// BEFORE (Legacy)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
}

// AFTER (Nodus Compliant)
// HTML becomes declarative:
<button data-action="ui.toggleSidebar" data-context='{"panel": "left"}'>
    Toggle Sidebar
</button>

// ActionHandler processes the action:
actionHandlerRegistry.register('ui.toggleSidebar', async (action, event, flow, stateManager) => {
    // UI state changes are audited automatically
    stateManager.emit('ui.sidebar.toggle', action.context);
});
```

### Pattern 4: Migrating Cache Operations
```javascript
// BEFORE (Legacy)
class EmbeddingManager {
    constructor() {
        this.cache = new Map(); // Unbounded, unmonitored
    }
    
    getEmbedding(id) {
        return this.cache.get(id); // No audit trail
    }
    
    setEmbedding(id, data) {
        this.cache.set(id, data); // No security checks
    }
}

// AFTER (Nodus Compliant)
class EmbeddingManager {
    constructor({ stateManager }) {
        this.stateManager = stateManager;
        this.forensicRegistry = stateManager.managers.observability.forensicRegistry;
    }
    
    async getEmbedding(id) {
        return await this.forensicRegistry.wrapOperation('cache', 'get',
            () => this.cache.get(id),
            {
                cache: 'embeddings',
                key: id,
                requester: this.getCurrentUser(),
                classification: 'CONFIDENTIAL'
            }
        );
    }
    
    async setEmbedding(id, data) {
        return await this.forensicRegistry.wrapOperation('cache', 'set',
            () => this.cache.set(id, data),
            {
                cache: 'embeddings',
                key: id,
                value: data,
                requester: this.getCurrentUser(),
                classification: 'CONFIDENTIAL'
            }
        );
    }
}
```

---

## 📏 Performance Budget Requirements

All performance-critical operations must include explicit budget comments:

```javascript
// ✅ REQUIRED: Performance budget comments
/* PERFORMANCE_BUDGET: 5ms */
const cached = await cache.get(key);

/* PERFORMANCE_BUDGET: 10ms */
const runner = orchestrator.createRunner('operation');

/* PERFORMANCE_BUDGET: 20ms */
await runner.run(expensiveOperation);
```

**ESLint Rule**: `nodus/require-performance-budget`

---

## 🚨 Common Anti-Patterns to Avoid

### Anti-Pattern 1: Manual Observability
```javascript
// ❌ WRONG: Manual logging
forensicLogger.logAuditEvent('user.action', { userId, action });
metricsRegistry.increment('user.actions');

// ✅ CORRECT: Automatic observability
await actionDispatcher.dispatch('user.action', { userId, action });
// Audit and metrics are automatic
```

### Anti-Pattern 2: Bypassing Security Layers
```javascript
// ❌ WRONG: Direct cache access
const data = cache.get(key); // No MAC checks

// ✅ CORRECT: Forensic-wrapped access
const data = await forensicRegistry.wrapOperation('cache', 'get', 
    () => cache.get(key),
    { classification: 'CONFIDENTIAL', requester: userId }
);
```

### Anti-Pattern 3: Unbounded Collections
```javascript
// ❌ WRONG: Unbounded Map
const results = new Map(); // Will grow indefinitely

// ✅ CORRECT: Bounded cache
const results = cacheManager.getCache('results', { maxSize: 100, ttl: 300000 });
```

### Anti-Pattern 4: External Dependencies Without CDS
```javascript
// ❌ WRONG: Direct external calls
const response = await fetch('https://api.external.com');

// ✅ CORRECT: CDS Transport
const response = await CDS.fetch('https://api.external.com', {
    transport: 'secure',
    audit: true
});
```

---

## 🔧 ESLint Configuration

### Required ESLint Rules
```javascript
// .eslintrc.js
{
    "extends": ["plugin:nodus/recommended"],
    "rules": {
        // Core Architecture (ERROR - must fix)
        "nodus/no-direct-core-instantiation": "error",
        "nodus/require-async-orchestration": "error", 
        "nodus/require-action-dispatcher": "error",
        "nodus/prefer-alias-imports": "error",
        
        // Security (ERROR - must fix)
        "nodus/no-direct-dom-access": "error",
        "nodus/no-external-scripts": "error",
        "nodus/require-cds-transport": "error",
        "nodus/no-security-string-literals": "error",
        
        // Observability (ERROR - must fix)
        "nodus/require-observability-compliance": "error",
        "nodus/require-policy-compliance": "error",
        
        // Performance (WARN - should fix)
        "nodus/require-performance-budget": "warn"
    }
}
```

### Enterprise Configuration
```javascript
// For enterprise/defense tiers
{
    "extends": ["plugin:nodus/enterprise"],
    "rules": {
        // Additional enterprise rules
        "nodus/require-license-validation": "error",
        "nodus/require-signed-plugins": "error",
        "nodus/require-policy-gate": "error"
    }
}
```

---

## 🎯 Import Patterns

### Required Import Style
```javascript
// ✅ CORRECT: Canonical alias imports with extensions
import { AsyncOrchestrator } from "@shared/lib/async/AsyncOrchestrator.js";
import { ActionDispatcher } from "@platform/actions/ActionDispatcher.js";
import { ForensicRegistry } from "@platform/observability/ForensicRegistry.js";

// ❌ WRONG: Barrel imports or missing extensions
import { AsyncOrchestrator } from "@shared/lib/async"; // No extension
import * as Actions from "@platform/actions"; // Barrel import
```

**ESLint Rule**: `nodus/prefer-alias-imports`

---

## 🧪 Testing Patterns

### Unit Test Structure
```javascript
// tests/MyService.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockStateManager } from '@tests/helpers/mockStateManager.js';
import { MyService } from '@platform/services/MyService.js';

describe('MyService', () => {
    let service;
    let mockStateManager;
    
    beforeEach(() => {
        mockStateManager = createMockStateManager();
        service = new MyService({ stateManager: mockStateManager });
    });
    
    it('should use orchestrator for async operations', async () => {
        const spy = mockStateManager.managers.asyncOrchestrator.createRunner.spy;
        
        await service.processData({ test: 'data' });
        
        expect(spy).toHaveBeenCalledWith('data.processing');
    });
});
```

### Integration Test Patterns
```javascript
// tests/integration/UserWorkflow.test.js
import { describe, it, expect } from 'vitest';
import { setupTestEnvironment } from '@tests/helpers/testEnvironment.js';

describe('User Workflow Integration', () => {
    it('should complete user signup with proper audit trail', async () => {
        const { actionDispatcher, forensicLogger } = setupTestEnvironment();
        
        // Trigger user action
        await actionDispatcher.dispatch('user.signup', {
            email: 'test@example.com',
            actor: 'system'
        });
        
        // Verify audit trail
        expect(forensicLogger.getAuditEvents()).toHaveLength(1);
        expect(forensicLogger.getAuditEvents()[0]).toMatchObject({
            action: 'user.signup',
            classification: 'CONFIDENTIAL'
        });
    });
});
```

---

## 🚨 Troubleshooting Common Issues

### Issue 1: "AsyncOrchestrator not found"
```
ERROR: AsyncOrchestrationService not found in stateManager
```

**Solution**: Ensure AsyncOrchestrator is registered via ServiceRegistry
```javascript
// In bootstrap/SystemBootstrap.js
await serviceRegistry.get('asyncOrchestrator');
```

### Issue 2: "Direct core instantiation detected"
```
ERROR: Do not instantiate core class 'SecurityManager' directly
```

**Solution**: Use stateManager.managers pattern
```javascript
// WRONG
const security = new SecurityManager();

// CORRECT  
const security = stateManager.managers.security;
```

### Issue 3: "Missing performance budget"
```
WARN: Performance-critical operation missing budget comment
```

**Solution**: Add performance budget comment
```javascript
/* PERFORMANCE_BUDGET: 10ms */
const result = await runner.run(operation);
```

### Issue 4: "Enterprise feature requires license validation"
```
ERROR: Enterprise method 'optimizePerformance' must validate license
```

**Solution**: Add license check
```javascript
if (license.hasFeature('system_optimization')) {
    systemOptimizer.optimizePerformance();
} else {
    throw new Error('Enterprise license required');
}
```

### Issue 5: "Manual observability detected"
```
ERROR: Manual forensic call 'logAuditEvent' is prohibited
```

**Solution**: Use automatic observability through orchestrator/ActionDispatcher
```javascript
// WRONG
forensicLogger.logAuditEvent('user.action', data);

// CORRECT
await actionDispatcher.dispatch('user.action', data);
// Audit logging is automatic
```

---

## 📚 Key Reference Files

- **Security Mandates**: `docs/NODUS_DEVELOPER_SECURITY_MANDATES.md`
- **Observability Plan**: `docs/nodus_observability_implementation_plan_v2.md`  
- **ESLint Rules**: `tools/eslint/eslint-plugin-nodus/`
- **State Manager**: `src/platform/state/HybridStateManager.js`
- **Orchestrator**: `src/shared/lib/async/AsyncOrchestrator.js`
- **Action Dispatcher**: `src/platform/actions/ActionDispatcher.js`
- **Forensic Registry**: `src/platform/observability/ForensicRegistry.js`

---

## ✅ Pre-Commit Checklist

- [ ] `npm run lint:strict` passes with 0 errors
- [ ] `npm run test:run` passes all tests  
- [ ] No direct core instantiation
- [ ] All async operations use orchestrator
- [ ] All state mutations use ActionDispatcher
- [ ] Performance budgets on critical operations
- [ ] License validation for enterprise features
- [ ] Proper security classifications applied
- [ ] Canonical import style with extensions

---

## 🎓 Learning Path

### Week 1: Core Architecture
1. Understand the three architectural patterns
2. Learn StateManager access patterns  
3. Practice ActionDispatcher for UI actions
4. Study ESLint rule documentation

### Week 2: Security & Observability  
1. Master ForensicRegistry patterns
2. Implement polyinstantiation in cache operations
3. Learn license tier enforcement
4. Practice performance budget annotations

### Week 3: Enterprise Features
1. Implement signed plugin validation
2. Add enterprise license gates
3. Master forensic audit trails
4. Optimize for defense-tier compliance

### Week 4: Migration & Testing
1. Migrate legacy components
2. Write comprehensive tests
3. Validate full compliance
4. Document migration patterns

---

**Remember**: Nodus enforces the highest security standards with zero tolerance for violations. These patterns ensure your code meets enterprise observability and security requirements while maintaining performance and reliability.

For questions or clarification, refer to the ESLint rule documentation in `tools/eslint/eslint-plugin-nodus/` for specific implementation details and examples.


# 🔧 **Nodus Error Handling & Observability Pattern Guide**

## 🎯 **Core Principle:**
**Everything flows through ActionDispatcher** - except when ActionDispatcher itself fails.

---

## 📋 **Pattern Decision Tree:**

### **1. Business Logic Operations** → **ActionDispatcher Only**
```javascript
// ✅ CORRECT: Let ActionDispatcher handle success/failure
#validateLicense() {
    const license = this.#managers.license;
    if (!license?.hasFeature("core_actions")) {
        this.#dispatchAction("security.license_validation_failed", { ... });
        throw new this.#PolicyError("Missing license");
    }
    
    this.#dispatchAction("security.license_validated", { ... });
}
```

**When to Use:**
- License validation
- User context initialization  
- Data sanitization results
- Policy checks
- Security operations
- Business rule validation

**Why:** Business operations should be fully observable through the centralized system.

---

### **2. Infrastructure Protection** → **Try-Catch + Fallback**
```javascript
// ✅ CORRECT: Protect infrastructure with fallback
#dispatchAction(actionType, payload) {
    try {
        this.#stateManager.managers.actionDispatcher?.dispatch(actionType, payload);
    } catch (error) {
        this.#emitCriticalWarning("Action dispatch failed", { actionType, error });
    }
}
```

**When to Use:**
- `#runOrchestrated()` - orchestrator failures
- `#dispatchAction()` - ActionDispatcher failures  
- `#emitWarning()` - observability system failures
- External service calls - network/API failures

**Why:** When primary observability systems fail, you need fallback mechanisms.

---

### **3. Ultimate Fallbacks** → **Console Logging**
```javascript
// ✅ CORRECT: Last resort when all systems fail
#emitCriticalWarning(message, meta) {
    try {
        this.#dispatchAction("observability.critical", { ... });
    } catch {
        console.error(`[Component:CRITICAL] ${message}`, meta);
    }
}
```

**When to Use:**
- When ActionDispatcher itself fails
- System-wide observability failure
- Bootstrap/initialization failures
- Last resort only

**Why:** Something must capture the error when all else fails.

---

## 🚨 **Anti-Patterns to Avoid:**

### **❌ Business Logic Try-Catch**
```javascript
// WRONG: Manual error handling for business operations
try {
    if (!license.hasFeature("x")) throw error;
} catch (error) {
    this.#emitWarning("License failed");  // Should use ActionDispatcher directly
}
```

### **❌ Silent Infrastructure Failures**
```javascript
// WRONG: No fallback when infrastructure fails
try {
    actionDispatcher.dispatch();
} catch {
    // Silent failure - should have console fallback
}
```

---

## 🎭 **Quick Reference:**

| **Operation Type** | **Pattern** | **Example** |
|-------------------|-------------|-------------|
| License check | ActionDispatcher | `this.#dispatchAction("security.license_failed")` |
| User validation | ActionDispatcher | `this.#dispatchAction("security.user_invalid")` |
| Orchestrator call | Try-catch + fallback | `try { orchestrator.run() } catch { fallback }` |
| ActionDispatcher call | Try-catch + fallback | `try { dispatch() } catch { fallback }` |
| System bootstrap | Console fallback | `console.error()` when all else fails |

---

## 🏆 **The Golden Rule:**
**If you can use ActionDispatcher to report it, do that. Only use try-catch when ActionDispatcher itself might fail.**

This ensures maximum observability while maintaining system resilience! 🔒