I. The Prime Directive: The V8 Parity Mandate
This is the central architectural rule. The V8 Parity refactor is the non-negotiable path to a stable, secure, and unified system.

1.1. The State Manager is the Single Source of Truth: All application state (entities, UI state, cache) and all core functionality (storage, security, events) MUST be owned and managed by the central HybridStateManager instance.

1.2. No Direct Instantiation of Core Services: Core services are NEVER instantiated directly. They are provided by the HybridStateManager. This will be enforced at the CI level.

Correct: const security = this.stateManager.securityManager;

Forbidden: import { SecurityManager } from '...'; const security = new SecurityManager();

This applies to: SecurityManager, MetricsRegistry, EventFlowEngine, ForensicLogger, ErrorHelpers, and all storage instances.

1.3. Service Registry Enforcement: A central ServiceRegistry.js MUST be implemented within the HybridStateManager to manage the instantiation and provision of all core services. A custom ESLint rule (no-direct-core-instantiation) MUST be added to eslint.config.js to fail any build that violates rule 1.2.

1.4. Zero New Runtime Dependencies: This is a zero-dependency project. All new features MUST be written in modern, dependency-free vanilla JavaScript (ES2022+). The date-fns library MUST be removed. A suite of regression tests comparing the internal DateUtils output against date-fns MUST be created and passed before its final removal.

II. Security & Auditing (Non-Negotiable)
Security is not a feature; it is the foundation. Bypassing these rules is a critical failure.

2.1. Arbitrary Code Execution is Forbidden: Executing JavaScript from a data source is the system's most significant vulnerability. The use of eval(), new Function(), setTimeout(string), and setting element.innerHTML with un-sanitized, dynamic data is strictly prohibited. A runtime validator MUST be added to HybridStateManager.init() to scan loaded modules for these patterns in development mode and throw a hard error.

2.2. Logic MUST be Declarative and Schematized: All dynamic logic (e.g., visibility, validation) MUST be implemented as declarative, serializable rules. A formal ConditionSchema.json MUST be created and used to validate all rules registered with the ConditionRegistry.

2.3. All Access MUST be Filtered: No module may access data directly. All data access MUST go through the stateManager.storage.instance methods (get, put, query). These methods are required as they enforce Mandatory Access Control (MAC) via the MACEngine and _filterReadable logic.

2.4. All Auditable Events MUST Use a Unified Envelope: Any action that creates, modifies, deletes, or accesses sensitive data MUST generate an auditable event. A ForensicLogger.createEnvelope() helper MUST be implemented in the ForensicLogger to enforce a uniform, signed, timestamped, and hash-chained structure for all log entries.

III. Code & Class Structure (Encapsulation & Style)
Code must be modern, explicit, and self-documenting.

3.1. Private Fields are LAW: All internal class properties and methods MUST be declared as private using the hash (#) prefix (e.g., #myPrivateField). Private fields MUST be declared at the top of the class body, before the constructor. The legacy _private underscore convention is forbidden in all new and refactored code.

3.2. Strict Encapsulation: If a property or method is not explicitly designed to be part of the class's public API, it MUST be private (#). There are no exceptions.

3.3. Private Field Testability: Private fields must not be weakened. To verify internal state, unit tests MUST use non-public-facing mechanisms, such as a debug-only proxy or symbolic keys, to inspect state without violating encapsulation.

3.4. Modern JavaScript is Required: Use modern web standards. var is forbidden. const is preferred over let. async/await is preferred over Promise .then() chains. All new files MUST use ES Modules (import/export).

3.5. Private Field Indexing: For any class exceeding 5 private fields, a JSDoc "private map" table (e.g., /** @privateFields {#cache, #policy, #state} */) MUST be added to the class-level JSDoc for quick reference.

IV. Performance & Memory
A secure system that is slow or leaks memory is a failed system.

4.1. All Caches MUST be Bounded: Unbounded caches (like a plain Map or Object) are a form of memory leak. All new caches MUST use a bounded strategy, such as the project's LRUCache.

4.2. No String Parsing in Hot Paths: Do not parse strings (e.g., JSON, ISO dates, "HH:mm" times) inside functions that are called frequently, such as render loops or condition evaluations. Pre-parse the data once (e.g., DateConditions.parseTimeString) and use the computed result at runtime.

4.3. Metrics are Not Optional: Any feature involving loops, caching, or data access MUST report metrics to the stateManager.metricsRegistry. A centralized metrics decorator (e.g., @measure('scope')) MUST be created and used to wrap performance-critical methods to standardize this reporting.

4.4. Performance Budgets are Enforced: A performance.test.js script MUST be added to the CI/CD pipeline. This script will enforce a maximum bundle size (e.g., 50KB gzipped) and defined latency targets. A CI failure is a hard blocker.

4.5. Memory Budgets are Defined: All major features (e.g., Grid, CacheManager) MUST have documented memory budget guidelines (e.g., "< 10MB heap resident") to detect and prevent regressions.

V. Code Quality & Maintenance
Write code for the next developer, not just for yourself.

5.1. JSDoc is Mandatory: Because this is a vanilla JavaScript project, "type checking" is enforced through documentation. All new classes, methods (public and private), and properties MUST have complete JSDoc annotations. API documentation MUST be auto-generated from JSDoc comments on every build (via jsdoc -c jsdoc.json) and published to /docs/v8/api/.

5.2. No Legacy or Deprecated Code: All files within the __DEPRECATED__ directory are forbidden to be imported or used. A build script MUST be added to scan for any import from this directory. A build that imports deprecated code is a failed build.

5.3. Clean, Simple, and Linted: Remove all unused variables, commented-out code blocks, and console.log statements before committing. Husky hooks MUST be configured to run ESLint and JSDoc validation pre-commit. A developer cannot commit code that fails these checks.