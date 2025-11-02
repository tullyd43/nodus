Perfect — here’s your **Nodus Migration Manifest (v8 transition)**.
This document maps every key file from your current repo into its new **feature-first + platform hybrid** structure and provides **alias + automation guidance** so you can reorganize without breaking imports.

---

## 🧭 OVERVIEW

This migration consolidates all code into four logical roots:

| Domain          | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| **`/app`**      | Bootstrapping & environment logic                                      |
| **`/platform`** | Shared runtime systems (security, state, services, storage, bootstrap) |
| **`/features`** | Product features (UI, Grid, Dashboard, Security, etc.)                 |
| **`/shared`**   | Reusable view primitives, utilities, and style assets                  |

---

## 🧩 MIGRATION MANIFEST

### 🗂️ 1. App & Bootstrap Layer

| Old Path                         | New Path                                    | Notes                              |
| -------------------------------- | ------------------------------------------- | ---------------------------------- |
| `src/main.js`                    | `src/app/main.js`                           | Entry point for the app bootstrap. |
| `src/core/SystemBootstrap.js`    | `src/platform/bootstrap/SystemBootstrap.js` | Platform-level orchestrator.       |
| `src/core/HybridStateManager.js` | `src/platform/state/HybridStateManager.js`  | Central state coordinator.         |
| `src/core/EventFlowEngine.js`    | `src/platform/state/EventFlowEngine.js`     | Centralized event routing.         |

---

### 🧱 2. Platform: Core Systems & Services

#### ⚙️ State + Adapters

| Old                                         | New                                                   |
| ------------------------------------------- | ----------------------------------------------------- |
| `src/ui/StateUIBridge.js`                   | `src/platform/state/adapters/StateUIBridge.js`        |
| `src/state/QueryService.js`                 | `src/platform/state/QueryService.js`                  |
| `src/core/CacheManager.js`                  | `src/platform/services/cache/CacheManager.js`         |
| `src/core/IdManager.js`                     | `src/platform/services/id/IdManager.js`               |
| `src/core/EmbeddingManager.js`              | `src/platform/services/embedding/EmbeddingManager.js` |
| `src/core/ActionHandlerRegistry.js` *(new)* | `src/platform/actions/ActionHandlerRegistry.js`       |

#### 🔐 Security

| Old                                        | New                                                      | Notes                                     |
| ------------------------------------------ | -------------------------------------------------------- | ----------------------------------------- |
| `src/core/security/SecurityManager.js`     | `src/platform/security/SecurityManager.js`               | Consolidated under security domain.       |
| `src/core/security/security-envelope.js`   | `src/platform/security/security-envelope.js`             | Moved from core for clarity.              |
| `src/core/security/ForensicLogger.js`      | `src/platform/security/ForensicLogger.js`                | Keep one canonical version.               |
| `src/core/SystemPoliciesCached.js`         | `src/platform/security/policies/SystemPoliciesCached.js` | Domain-specific policies.                 |
| `src/core/security/TenantPolicyService.js` | `src/platform/security/TenantPolicyService.js`           | Tenant-scoped policies.                   |
| `src/ui/SecurityExplainer.js`              | `src/features/security/SecurityExplainer.js`             | UI-facing component, remains in features. |

#### 🧩 Storage & Bootstrap

| Old                                   | New                                         |
| ------------------------------------- | ------------------------------------------- |
| `src/core/storage/StorageLoader.js`   | `src/platform/storage/StorageLoader.js`     |
| `src/core/storage/ValidationLayer.js` | `src/platform/storage/ValidationLayer.js`   |
| `src/core/storage/modules/*`          | `src/platform/storage/modules/*`            |
| `src/core/SystemBootstrap.js`         | `src/platform/bootstrap/SystemBootstrap.js` |

---

### 🧠 3. Features: Domain-Specific Logic

#### 🪟 UI System

| Old                                  | New                                        |
| ------------------------------------ | ------------------------------------------ |
| `src/ui/BuildingBlockRenderer.js`    | `src/features/ui/BuildingBlockRenderer.js` |
| `src/ui/BindEngine.js`               | `src/features/ui/BindEngine.js`            |
| `src/ui/ActionDispatcher.js`         | `src/features/ui/ActionDispatcher.js`      |
| `src/ui/ComponentToolbox.js` *(new)* | `src/features/ui/ComponentToolbox.js`      |
| `src/ui/VirtualList.js`              | `src/shared/components/VirtualList.js`     |
| `src/ui/themes/*`                    | `src/shared/styles/themes/*`               |

#### 🧮 Grid

| Old                                      | New                                               |
| ---------------------------------------- | ------------------------------------------------- |
| `src/grid/CompleteGridSystem.js`         | `src/features/grid/CompleteGridSystem.js`         |
| `src/grid/EnhancedGridRenderer.js`       | `src/features/grid/EnhancedGridRenderer.js`       |
| `src/grid/GridEnhancementIntegration.js` | `src/features/grid/GridEnhancementIntegration.js` |
| `src/grid/GridHistoryInspector.js`       | `src/features/grid/GridHistoryInspector.js`       |
| `src/grid/runtime/GridRuntimeConfig.js`  | `src/features/grid/runtime/GridRuntimeConfig.js`  |
| `src/grid/policies/core.js`              | `src/features/grid/policies/coreGridPolicies.js`  |

#### 🧭 Dashboard

| Old                                                     | New                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/ui/DeveloperDashboard.js`                          | `src/features/dashboard/DeveloperDashboard.js`                          |
| `src/core/managers/DatabaseOptimizationControlPanel.js` | `src/features/dashboard/components/DatabaseOptimizationControlPanel.js` |

#### 🛡️ Security Feature

| Old                                                | New                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `src/core/security/PolicyControlBlock_Enhanced.js` | `src/features/security/components/PolicyControlBlock_Enhanced.js` |
| `src/ui/SecurityExplainer.js`                      | `src/features/security/SecurityExplainer.js`                      |

---

### 🧰 4. Shared Libraries & Utilities

| Old                            | New                                 | Notes               |
| ------------------------------ | ----------------------------------- | ------------------- |
| `src/utils/DateUtils.js`       | `src/shared/lib/DateUtils.js`       | Formatting helpers. |
| `src/utils/ErrorHelpers.js`    | `src/shared/lib/ErrorHelpers.js`    |                     |
| `src/utils/MetricsRegistry.js` | `src/shared/lib/MetricsRegistry.js` |                     |
| `src/utils/LRUCache.js`        | `src/shared/lib/LRUCache.js`        |                     |
| `src/utils/BoundedStack.js`    | `src/shared/lib/BoundedStack.js`    |                     |
| `src/ui/blocks/*`              | `src/shared/components/blocks/*`    |                     |
| `src/ui/layouts/*`             | `src/shared/components/layouts/*`   |                     |
| `src/ui/themes/*`              | `src/shared/styles/*`               |                     |

---

## ⚙️ ALIAS CONFIGURATION (vite.config.js)

Add these aliases for clean imports:

```js
resolve: {
  alias: {
    "@app": "/src/app",
    "@platform": "/src/platform",
    "@features": "/src/features",
    "@shared": "/src/shared"
  }
}
```

Now you can import like:

```js
import { SystemBootstrap } from "@platform/bootstrap/SystemBootstrap.js";
import { BindEngine } from "@features/ui/BindEngine.js";
import { GridRuntimeConfig } from "@features/grid/runtime/GridRuntimeConfig.js";
import { DateCore } from "@shared/lib/DateUtils.js";
```

---

## 🧪 TEST & DOCS MIRROR

| Path                   | Destination                                           |
| ---------------------- | ----------------------------------------------------- |
| `tests/ui/*.test.js`   | `tests/features/ui/*.test.js`                         |
| `tests/grid/*.test.js` | `tests/features/grid/*.test.js`                       |
| `tests/core/*.test.js` | `tests/platform/**/*.test.js`                         |
| `docs/*.md`            | `docs/features/<feature>` or `docs/platform/<domain>` |

---

## ⚡ AUTOMATION SCRIPT TEMPLATE

If you want to automate this migration safely, here’s a **Node.js skeleton**:

```js
// scripts/migrate-structure.js
import fs from "fs/promises";
import path from "path";

const moves = [
  ["src/main.js", "src/app/main.js"],
  ["src/core/SystemBootstrap.js", "src/platform/bootstrap/SystemBootstrap.js"],
  ["src/ui/StateUIBridge.js", "src/platform/state/adapters/StateUIBridge.js"],
  ["src/ui/BindEngine.js", "src/features/ui/BindEngine.js"],
  ["src/grid/EnhancedGridRenderer.js", "src/features/grid/EnhancedGridRenderer.js"],
  // ...add all remaining mappings from manifest
];

for (const [oldPath, newPath] of moves) {
  const newDir = path.dirname(newPath);
  await fs.mkdir(newDir, { recursive: true });
  try {
    await fs.rename(oldPath, newPath);
    console.log(`✅ Moved: ${oldPath} → ${newPath}`);
  } catch (err) {
    console.error(`⚠️ Failed to move ${oldPath}:`, err.message);
  }
}
```

After running:

```bash
node scripts/migrate-structure.js
```

Run a mass import fix:

```bash
npx jscodeshift -t scripts/update-imports.js src/
```

(where `update-imports.js` rewrites paths based on new aliases).

---

## ✅ POST-MIGRATION CHECKLIST

| Task                                | Command                                            |
| ----------------------------------- | -------------------------------------------------- |
| 1️⃣ Run ESLint secure gate          | `node scripts/run-eslint-secure.js src`            |
| 2️⃣ Generate JSDoc stubs            | `node scripts/generate-jsdoc-stubs.js src`         |
| 3️⃣ Run all tests                   | `npm test`                                         |
| 4️⃣ Run migration verification      | `grep -R "src/core" src` → should return 0 results |
| 5️⃣ Update documentation references | Search & replace old paths in `/docs/`             |

---

## 🧠 Summary

✅ Feature domains (Grid, UI, Dashboard, Security) are **self-contained**.
✅ Platform systems (state, security, services) remain **centralized and reusable**.
✅ Shared library (`shared/lib`, `shared/components`) becomes your **foundation layer**.
✅ All imports are simplified and environment-agnostic.
✅ This layout is future-proof for **plugins, extensions, and CI pipelines**.

---

Would you like me to generate the actual **Node.js migration script bundle** (`migrate-structure.js` + `update-imports.js`) ready to run in your repo root?
