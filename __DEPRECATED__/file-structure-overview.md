# Nodus File Structure Overview

## Top-Level Directories
- `src/` – Front-end application source organized by app, platform, features, and shared modules.
- `server/` – Minimal Node runtime glue (Express endpoints, CDS routing).
- `scripts/` – Maintenance tooling (lint wrappers, secure refactors, setup helpers).
- `tests/` – Jest suites mirroring the feature/platform layout.
- `docs/` – Architecture and documentation plans.
- `db/` – SQL migration snapshots for the reference data store.
- `dist/` – Build artifacts (ignored during regular development).
- `public/` – Static assets served verbatim by Vite (currently unused).
- Root configs (`package.json`, `vite.config.js`, `eslint.config.js`, etc.) – Toolchain and build configuration.

## `src/app`
- `main.js` – Browser entry point; wires platform bootstrap into the DOM.
- `environment.config.js` – Declarative environment flags consumed during bootstrap.

## `src/platform`
- `bootstrap/SystemBootstrap.js` – Orchestrates startup by wiring services, policies, and UI shell.
- `bootstrap/ServiceRegistry.js` – Dependency locator used by features and services.
- `state/HybridStateManager.js` – Single source of truth for application state orchestration.
- `state/EventFlowEngine.js` – Event bus for platform-level reactions.
- `state/QueryService.js` – Read-only query facade for features.
- `state/StateUIBridge.js` – Adapter that exposes state updates to the UI layer.
- `actions/ActionHandlerRegistry.js` – Registers and resolves platform actions.
- `actions/ActionDispatcher.js` – Dispatch pipeline shared by features.
- `services/EmbeddingManager.js` – AI embedding lifecycle management.
- `services/cache/CacheManager.js` – Cross-feature caching utilities.
- `services/id/IdManager.js` – Deterministic ID generation.
- `security/*` – Mandatory access control, crypto envelopes, policy enforcement, and keyring implementations.
- `optimization/*` – Performance and database optimization helpers plus WebSocket server shim.
- `rules/*` – Condition registry/schema for runtime rules evaluation.
- `extensions/*` – Plugin manifest loading and extension management.
- `storage/*` – Storage adapters, validation layers, forensic logging, sync stack modules.

## `src/features`
- `dashboard/DeveloperDashboard.js` – Dev-focused dashboard shell.
- `dashboard/components/DatabaseOptimizationControlPanel.js` – Dashboard widget for DB tuning.
- `grid/*` – Grid authoring runtime (renderers, layout assistant, policies, runtime stores, CSS).
- `search/global-search-bar.js` – Global search feature entry.
- `security/*` – Feature-side security UX (policy controls, explainers).
- `ui/*` – Application UI orchestration (binding engine, renderer, toolbox, dispatcher).
- `ui/runtime/*` – Low-level runtime components powering the feature UI surface.

## `src/shared`
- `components/*` – Reusable view primitives (VirtualList, performance overlays, policy blocks).
- `lib/*` – Utility library (async helpers, metrics, caches, DOM safety, date utilities).
- `styles/` – Shared style tokens and base CSS (currently placeholder if empty).

## `server`
- `index.js` – Express bootstrap; mounts secure routes and middleware.
- `routes/cds.js` – Control data service (CDS) API route.

## `scripts`
- `run-eslint-secure.js` – Hardened ESLint runner honoring security mandates.
- `quickfix-secure-wrap.js` – DOM auto-hardening utility.
- `secure-refactor-dom.js` – Refactor helper to enforce safe DOM patterns.
- `security-attest-auto-remediate.js` – Security attestation automation.
- `generate-jsdoc-stubs.js` – Generates JSDoc placeholders.
- `setup.js` – One-off environment bootstrap script.
- `main.css` – Shared stylesheet used by script-generated pages.

## `tests`
- `grid/*` – Behavioral coverage for grid renderer, snap/drag logic, history, and state integration.
- `security/*` – MAC engine, CDS, and non-repudiation verification tests.
- `storage/StorageLoader.test.js` – Integration coverage for storage boot.
- `ui/BindEngine_v2.test.js` – UI binding regression suite.
- `test plan.txt` – High-level testing roadmap.

## `db`
- `nodus.sql` – Master schema reference.
- `00x_*.sql` – Incremental migrations for security domains, CDS workflow, and polyinstantiation.

## `docs`
- `docs/ARCHITECTURE_TRANSFORMATION_COMPLETE.md` – Snapshot of final target architecture.
- `docs/DOCUMENTATION_PLAN.md` – Coverage roadmap for documentation.
- `docs/JSDOC_STRATEGY.md` – JSDoc authoring plan.
- `cds_bootstrap.md` – CDS bootstrapping reference notes.
