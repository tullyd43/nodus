## Purpose

This file gives concise, actionable guidance for AI coding agents (Copilot/GPT) to be productive in the Nodus repository. It summarizes the project's mental model, important enforcement rules discovered in the repository, developer workflows, and concrete examples you should follow or avoid.

Quick start (commands)

- Use node >= 20 and npm >= 10 (Volta pins Node 22.17 in package.json).
- Setup: npm run setup
- Dev server: npm run dev (runs Vite via tools/vite.config.js)
- Build: npm run build
- Run tests: npm run test (vitest, config in tools/vite/vite.config.js)
- Lint (secure mode): npm run lint:secure (honors security allowlist overrides)
- Full CI/validate: npm run validate (runs lint, format check, typecheck, tests, docs check, scan)

Key architecture & conventions (do read the referenced files)

- Single-page front-end app in `src/` with clear layers: `src/platform/` (core services & boot), `src/features/` (domain features like grid, search), `src/shared/` (reusable libs/components). See `.copilot/file-structure-overview.md` and `tools/vite/vite.config.js` for path aliases (e.g. `@shared`, `@platform`, `@features`).
- Server API is minimal Express glue in `server/index.js` (local DB pool for development). Use it only for integration tests or dev APIs.
- Critical boundaries: ActionDispatcher (synchronous gateway) and AsyncOrchestrationService / AsyncOrchestrator (async kernel). All sync mutations must pass through ActionDispatcher and all async flows must use the orchestrator runner APIs. See `.copilot/agent.json` "enforcement" and `.copilot/project-context.md`.

Security & forensic rules (enforced by repo lint rules)

- Forensic envelopes: Any function that mutates data (names starting with save/update/create/delete) must call ForensicLogger.createEnvelope; otherwise ESLint rule `copilotGuard/require-forensic-envelope` will flag it. (See `tools/eslint/eslint-plugin-copilot-guard` and `.eslint-allowlist.json`.)
- No direct DOM/BOM access in platform code: usages of `document`, `window`, `localStorage`, `sessionStorage` are forbidden except in allowed files (rule: `nodus/no-direct-dom-access`). Use `@shared/lib/SafeDOM.js` / BindEngine instead.
- No insecure APIs: `innerHTML`, `outerHTML`, `eval`, `Function`, raw `fetch`/XHR are blocked by `copilotGuard/no-insecure-api`. Prefer `SafeDOM` and `SecureFetch` wrappers.
- No runtime dependencies: Avoid new external runtime packages in application code (rule `copilotGuard/no-runtime-dependencies` / `nodus/no-runtime-dependencies`). Use built-in Web APIs, in-house utilities, or add dev-time build-time plugins only in tools/config.
- Security gate & policy: Security-sensitive modules must reference the PolicyControlBlock API (`nodus/require-policy-gate`) and call MAC checks (`enforceNoWriteDown`, `enforceNoReadUp`) before data ops.

Imports & aliases

- Prefer explicit alias imports configured in `tools/vite/vite.config.js` (e.g. `import X from '@shared/lib/X.js'`). Avoid legacy absolute imports or index barrels. The `nodus/prefer-alias-imports` ESLint rule enforces this.

Documentation & tests

- Public methods must include JSDoc with params, return type and a short forensic note. The copilot-guard rule `require-jsdoc-and-tests` suggests JSDoc presence for public methods.
- Add unit tests for critical paths (vitest, tests live under `tests/` and files follow `tests/**/*.test.js`). Tests should assert forensic envelope creation and MAC enforcement where applicable.

Examples (do this / don't do this)

- Do: import SecureFetch via canonical module and wrap network calls in orchestrator runners.
  import SecureFetch from '@platform/security/SecureFetch.js'
- Don't: call fetch(...) or use innerHTML directly in feature/platform code.
- Do: wrap synchronous action mutations through ActionDispatcher so ForensicLogger can attach metadata.
- Don't: add new runtime NPM deps for application code; if you must, open an architecture/security review and add exceptions in `tools/eslint/.eslint-allowlist.json`.

Where to look for authoritative policy

- `.copilot/project-context.md` — high-level principles
- `.copilot/agent.json` — detailed enforcement, lint integrations and allowlist wiring
- `tools/eslint/` — custom ESLint rules (`eslint-plugin-nodus`, `eslint-plugin-copilot-guard`) and ` .eslint-allowlist.json` + `.eslint.config.exception.js` for permitted exceptions
- `tools/vite/vite.config.js` — path aliases, test config (vitest), and build chunking decisions
- `src/platform/ActionDispatcher.js`, `src/platform/AsyncOrchestrationService.js`, `src/platform/ForensicLogger.js` (search these paths) — to understand runtime contracts

If you are uncertain

- Prefer conservative, auditable, minimal-change patches that preserve ActionDispatcher/orchestrator boundaries and include JSDoc + a test. Mention the governing rule in PR description (e.g. "addresses nodus/require-async-orchestration").

Reporting & PR notes

- Add a short "Forensic & Security" checklist to PR descriptions for changes touching state, storage, or network. Reference the rule(s) changed (e.g. `copilotGuard/require-forensic-envelope`).

Feedback

- If any enforcement seems too strict for a proposed change, point to the exact file and line where the OR needs to be relaxed and propose a minimal exception in `tools/eslint/.eslint-allowlist.json` with a justification.

End
