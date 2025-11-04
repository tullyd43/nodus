## Nodus — Copilot / AI Agent Instructions

Purpose: provide succinct, actionable guidance so an AI coding agent can be immediately productive in this repository.

Quick start (use project npm scripts):

- Development server: `npm run dev` (Vite via `tools/vite.config.js`)
- Build: `npm run build`
- Unit tests: `npm run test:run` (Vitest via `tools/vite.config.js`)
- E2E tests: `npm run test:e2e` (Playwright)
- Lint (strict): `npm run lint:strict` — secure rules live under `tools/eslint/eslint-plugin-nodus/`
- Lint (secure/tolerant): `npm run lint:secure` (used in some CI flows)
- Validate (full local pre-CI): `npm run validate` (runs lint, format check, typecheck, tests, docs check, scan)

Big picture architecture (fast summary):

- Single source of truth: `HybridStateManager` — see `src/platform/state/HybridStateManager.js`. Most services/managers attach to it (security, policies, observability, async orchestrator).
- Execution gateways:
    - Async flows: `AsyncOrchestrator` family under `src/shared/lib/async/` and the `AsyncOrchestrationService.js` wrapper.
    - Sync/UI actions: Action-dispatch style exists conceptually — prefer ActionDispatcher patterns where present (see docs).
- Policy & observability: policy-driven decisions are enforced across platform; docs live in `docs/` (e.g., `nodus_observability_implementation_plan_v2.md`, `NODUS_DEVELOPER_SECURITY_MANDATES.md`).
- Storage & sync: `src/platform/storage/*` contains IndexedDB adapters, validation layers and sync modules; all interact with the state manager.
- Server-side shim: `server/index.js` provides the back-end dev server entry.

Key project-specific conventions (must follow):

- EXPLICITLY ENFORCE THE RIGOROUS SECURITY MANDATES AND PATTERNS TO THE HIGHEST DEGREE WITH NO COMPROMISE.
- Do NOT instantiate core managers directly — use `HybridStateManager` to access services. ESLint rule: `tools/eslint/eslint-plugin-nodus/no-direct-core-instantiation.js`.
- All async workflows should run through the AsyncOrchestrator (use the orchestration service). See `src/shared/lib/async/AsyncOrchestrationService.js` and `src/shared/lib/async/AsyncOrchestrator.js` for patterns and plugin hooks (ForensicPlugin, MetricsPlugin, etc.).
- Imports use canonical aliases and explicit extensions (examples found in code):
    - Good: `import { AsyncOrchestrator } from "@shared/lib/async/AsyncOrchestrator.js"`
    - Avoid barrel/index imports or missing `.js` extensions.
- No manual forensic or direct logging calls for state mutations — observability is automatic via orchestrator/plugins and state manager. ESLint rules enforce this: `require-observability-compliance.js` and `require-async-orchestration.js`.
- Security & forbidden APIs: the repo enforces strong rules (see `docs/NODUS_DEVELOPER_SECURITY_MANDATES.md`) and ESLint rules under `tools/eslint/eslint-plugin-nodus/` for:
    - No `eval`, `new Function`, DOM injection (`innerHTML`/`outerHTML`), direct `fetch` (must use CDS transport), dynamic remote imports, and browser storage for PII.

Where to look for enforcement and examples:

- ESLint rules: `tools/eslint/eslint-plugin-nodus/*.js` (e.g., `require-action-dispatcher.js`, `require-policy-compliance.js`, `no-direct-dom-access.js`). Use these when making code changes.
- Core state & wiring: `src/platform/state/HybridStateManager.js` — how managers are wired and accessed.
- Async instrumentation plugins and orchestration: `src/shared/lib/async/` (plugins: `ForensicPlugin.js`, `MetricsPlugin.js`, `StateEventsPlugin.js`). Use these for examples of how instrumentation should be added.
- Storage modules: `src/platform/storage/*` — examples of stateful modules expecting the `stateManager` in their constructor.
- Tests: `tests/` contains unit and focused tests; use `npm run test:run` and `npm run test:coverage` to validate changes.

Examples of correct patterns (copyable snippets):

- Accessing a manager from state manager (preferred):
  const security = this.stateManager.managers.security;

- Running an async operation through orchestrator:
  const runner = this.stateManager.managers.asyncOrchestrator.createRunner('operation');
  await runner.run(async () => {
  // business logic here — instrumentation/plugins handle metrics/audit
  });
- USE ON THIS KNOWN WORKING FORMAT: /* PERFORMANCE_BUDGET: 10ms */
  EXAMPLE USAGE: const result = await /* PERFORMANCE_BUDGET: 10ms */  runner.run(..
  EXAMPLE USAGE: /* PERFORMANCE_BUDGET: 10ms */     above run or createrunner calls

Notes on edits and PRs:

- Keep changes minimal and follow canonical import style (aliases + `.js` extension).
- Run `npm run lint:strict` and `npm run test:run` before opening PR. CI runs `npm run ci` which includes security allowlist checks.
- If making changes to instrumentation or policy logic, update/add unit tests under `tests/` and refer to `tools/eslint/eslint-plugin-nodus/` for any new lint rules you need.

If anything here is unclear or you want more examples (e.g., where to add an AsyncOrchestrator plugin, or how HybridStateManager is bootstrapped), tell me which area and I'll expand with concrete file-level guidance or small code edits.

---

References (in-repo):

- `src/platform/state/HybridStateManager.js`
- `src/shared/lib/async/AsyncOrchestrator.js`
- `src/shared/lib/async/AsyncOrchestrationService.js`
- `tools/eslint/eslint-plugin-nodus/` (custom lint rules)
- `docs/NODUS_DEVELOPER_SECURITY_MANDATES.md`
- `docs/nodus_observability_implementation_plan_v2.md`
