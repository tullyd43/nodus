```chatmode
---
description: "Implementation / feature-creation chat mode for Nodus (merged guidance)."
tools: []
---

This chat mode is used when implementing new features, preparing small-to-medium patches, and guiding AI agents that will produce code for this repository.

Key constraints and behavior for the implement chat mode:

- Security-first and audit-first: ensure all code suggestions honor the repository's enforced ESLint rules and `SECURITY_ADDENDUM.md`.
- Keep patches small and conservative. Prefer minimal, well-tested changes that preserve existing ActionDispatcher and orchestrator boundaries.
- Always include JSDoc for exported members and add unit tests for new public behavior.

Quick commands (developer workflow):

- Setup: `npm run setup` (pins node, installs dev deps)
- Dev server: `npm run dev` (Vite-based SPA)
- Run tests: `npm run test` (vitest)
- Lint (secure mode): `npm run lint:secure`
- Full CI/validate: `npm run validate` (lint, format, typecheck, tests, docs, scan)

Implementation steps (minimal, repeatable):

1. Create a small feature branch named `feature/<short-descriptor>`.
2. Add or update source under `src/features/` (feature-specific) or `src/shared/` (cross-feature libs).
3. Use canonical alias imports (see `tools/vite/vite.config.js`) — e.g., `import X from '@shared/lib/X.js'`.
4. For any state mutation or write operation call `ForensicLogger.createEnvelope()` before mutating state. See `src/platform/ForensicLogger.js`.
5. Route asynchronous work through the orchestrator runner (`AsyncOrchestrationService` / `asyncOrchestrator`) — do not use raw top-level `async` workflows in shipping code. See `src/platform/AsyncOrchestrationService.js`.
6. Add JSDoc to exported public functions (params, returns, forensic note) and unit tests in `tests/` mirroring the module path.
7. Run `npm run lint:secure` and `npm run test`. Fix violations flagged by custom eslint plugins under `tools/eslint/`.

Enforced/project-specific standards (do not skip):

- Forensic Envelope Rule: Every function that mutates data (save/update/delete) must call `ForensicLogger.createEnvelope()` before the mutation. The repo's ESLint rules (`copilot-guard`) will fail builds otherwise.
- Async Orchestration Rule: All async flows must be executed using the orchestrator runner APIs. See `src/platform/AsyncOrchestrationService.js` and usages in `src/platform/`.
- Import Canonicalization: Prefer alias imports (e.g. `@shared/*`, `@platform/*`) or explicit relative paths that include file extensions. Avoid index-barrel imports; see `tools/eslint/prefer-alias-imports.js`.
- No runtime third-party dependencies: Avoid adding new runtime npm packages. Dev/test tooling is allowed (`vitest`, `eslint`, etc.). See `SECURITY_ADDENDUM.md` and `tools/eslint/` rules.
- Forbidden APIs: Do NOT use `eval`, `new Function`, raw `fetch`/XHR, `innerHTML`/`outerHTML`, or direct `localStorage` — checks exist in ESLint and CI scanners. See `SECURITY_ADDENDUM.md` for details.
- JSDoc + Tests: Exported functions must have JSDoc and corresponding unit tests. The `copilotGuard/require-jsdoc-and-tests` rule enforces this.

Key files & patterns (quick references):

- Forensic logger: `src/platform/ForensicLogger.js` (envelope creation pattern)
- Async orchestrator: `src/platform/AsyncOrchestrationService.js` and `src/platform/AsyncOrchestrator.js`
- Action dispatcher & sync gateway: `src/platform/actions/` and `src/platform/ActionDispatcher.js`
- ESLint rules and security enforcement: `tools/eslint/` (custom plugins live here)
- Security policy: `SECURITY_ADDENDUM.md` and `docs/` (developer mandates)
- Copilot / agent rules: `.copilot/agent.json` and `.github/copilot-instructions.md`

Examples (patterns to follow):

- Mutating user settings (pseudo):

  - Create envelope: `const env = ForensicLogger.createEnvelope({ actor, action: 'update-settings', object_ref });`
  - Dispatch via ActionDispatcher: `ActionDispatcher.dispatch('settings:update', { envelope: env, payload });`
  - Async side-effects: `return asyncOrchestrator.createRunner(...).run()`

- Import example:

  - Good: `import SecureFetch from '@platform/security/SecureFetch.js'`
  - Bad: `import X from '../../shared/index'` (barrel) or `fetch('/api')` (raw)

PR Checklist (before opening):

- [ ] Branch is small and focused (single logical change)
- [ ] JSDoc present for public functions
- [ ] Forensic envelope created for all writes
- [ ] Async work routed through orchestrator
- [ ] Unit tests added/updated and passing locally
- [ ] `npm run lint:secure` passes locally
- [ ] No forbidden APIs introduced (run `npm run validate` if unsure)

Notes for AI agents:

- Do not introduce new runtime dependencies or unsafe APIs. Cite the relevant security rule in comments when generating security-sensitive code (see `.copilot/agent.json` for enforcement).
- Prefer small, conservative patches that preserve ActionDispatcher and orchestrator boundaries. Add unit tests and a short JSDoc note describing forensic implications.

---

If you want a separate `egent` file kept in chatmodes, say so; otherwise consider this the canonical implement chatmode guidance.
```

---

description: 'Description of the custom chat mode.'
tools: []

---

Define the purpose of this chat mode and how AI should behave: response style, available tools, focus areas, and any mode-specific instructions or constraints.
