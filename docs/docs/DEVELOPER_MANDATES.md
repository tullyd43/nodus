I. The Prime Directive: The V8 Parity Mandate
This is the central architectural rule. The V8 Parity refactor is the non-negotiable path to a stable, secure, and unified system.

1.1. The State Manager is the Single Source of Truth: All application state (entities, UI state, cache) and all core functionality (storage, security, events) MUST be owned and managed by the central HybridStateManager instance.

1.2. No Direct Instantiation of Core Services: Core services are NEVER instantiated directly. They are provided by the HybridStateManager. This will be enforced at the CI level.

Correct: const security = this.stateManager.securityManager;

Forbidden: import { SecurityManager } from '...'; const security = new SecurityManager();

This applies to: SecurityManager, MetricsRegistry, EventFlowEngine, ForensicLogger, ErrorHelpers, and all storage instances.

1.3. Service Registry Enforcement: A central ServiceRegistry.js MUST be implemented within the HybridStateManager to manage the instantiation and provision of all core services. A custom ESLint rule (no-direct-core-instantiation) MUST be added to eslint.config.js to fail any build that violates rule 1.2.

1.4. Zero New Runtime Dependencies: This is a zero-dependency project. All new features MUST be written in modern, dependency-free vanilla JavaScript (ES2022+). The date-fns library MUST be removed. A suite of regression tests comparing the internal DateUtils output against date-fns MUST be created and passed before its final removal.

1.5. Canonical Imports Only: Every import MUST use the canonical project aliases (e.g. `@shared/lib/SafeDOM.js`) or an explicit relative path that resolves to a concrete file including its extension. Legacy index barrels (`.../index.js`) and shim aliases (`@core`, `@core/state`, etc.) are forbidden. Example:

Correct:

```
import { SafeDOM } from "@shared/lib/SafeDOM.js";
import createRunner from "../../async/create-runner.js";
```

Forbidden:

```
import SafeDOM from "@core/SafeDOM";
import runner from "../../async"; // missing extension, index barrel
```

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


## VI. Threat Model & Security Gates (CI-enforced)

**VI.1 Minimal Threat Model**
- Adversaries: internet attackers, insider misuse, compromised browser, supply-chain tampering.
- Goals: read↑ / write↓ violations, side-channels, log/key tampering, offline persistence abuse.
- Surfaces: UI flows, IndexedDB, adapters, workers, audit bus, plugin manifests, keyring.

**VI.2 CI Security Gates (build = fail if any gate fails)**
- `no-direct-core-instantiation`, `no-dangerous-eval`, `forensic-required`.
- `forbidden-web-apis`: disallow `eval`, `new Function`, unsanitized `innerHTML`; block `postMessage` without origin checks; forbid `BroadcastChannel`/`SharedArrayBuffer` unless allowlisted.
- Any mutation path must call `ForensicLogger.createEnvelope()` before commit.

## VII. Cryptography, Keys & Constant-Time

- Keys only via **Keyring** (domain-scoped, label-bound, rotatable).
- Use browser SubtleCrypto only in crypto wrapper.
- Constant-time/padded checks for MAC and index probes via `constantTimeCheck`.

## VIII. Side-Channels

- Pad sensitive reads; per-page fixed-bucket timing for bulk queries.
- Opaque IDs in stores (no level in keys). Errors are classification-neutral.

## IX. Forensic Audit & Non-Repudiation

- Every C/U/D **and sensitive read** emits signed forensic envelope.
- Append-only logs, hash-chain, periodic anchors, replay/gap detection.

## X. Polyinstantiation & CDS

- One row per `(logical_id, classification_level)`, envelope-encrypted `instance_data`.
- Merge only readable rows; never leak existence of higher levels.
- CDS is ticketed; redaction deterministic; every decision signed & logged.

## XI. Frontend Safety

- No raw HTML; if unavoidable, sanitize with local allowlist.
- Strict CSP (tighten as needed), local assets only by default.

## XII. Performance & Memory Security

- All caches bounded (LRU). No JSON/date parse in render loops.
- Budgets (CI): bundle gz ≤ 50KB, p95 read ≤ 50ms offline / ≤ 150ms online.

## XIII. Supply Chain

- Zero new runtime deps. Reproducible builds. Lockfile pinned.
- SAST (ESLint + custom), basic DAST/fuzz (dev-only).
```

---

# 2) ESLint setup (flat config) + custom plugin

## 2.1 `eslint.config.js` (root)

```js
// eslint.config.js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: {
      nodus: await import("./tools/eslint-plugin-nodus/index.js"),
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-alert": "error",
      "no-console": ["error", { allow: ["warn", "error", "info", "debug", "log", "trace", "dir"] }],
      "nodus/no-direct-core-instantiation": "error",
      "nodus/no-dangerous-eval": "error",
      "nodus/forensic-required": "error",
    },
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "coverage/**"
    ]
  }
];
```

## 2.2 Custom ESLint plugin (no external deps)

```
tools/
  eslint-plugin-nodus/
    index.js
```

**`tools/eslint-plugin-nodus/index.js`**

```js
// Minimal custom rules with AST from ESLint's parser
export const meta = { name: "eslint-plugin-nodus", version: "0.1.0" };

function isCoreClass(name) {
  // Add more core classes if needed
  return [
    "HybridStateManager",
    "StorageLoader",
    "MACEngine",
    "ClassificationCrypto",
    "ForensicLogger",
  ].includes(name);
}

export default {
  rules: {
    "no-direct-core-instantiation": {
      meta: { type: "problem", docs: { description: "Disallow new Core() outside factories" } },
      create(ctx) {
        return {
          NewExpression(node) {
            const callee = node.callee;
            if (callee && callee.type === "Identifier" && isCoreClass(callee.name)) {
              // Allow in factory files or DI container only (adjust pattern)
              const filename = ctx.filename || "";
              const allowed = /Factory|Bootstrap|SystemBootstrap|ServiceRegistry/.test(filename);
              if (!allowed) {
                ctx.report({
                  node,
                  message: `Do not instantiate core class '${callee.name}' directly; use ServiceRegistry/Factory.`,
                });
              }
            }
          }
        };
      }
    },

    "no-dangerous-eval": {
      meta: { type: "problem", docs: { description: "Block eval/new Function/unsafe timers" } },
      create(ctx) {
        const forbidCallee = new Set(["eval", "Function", "setTimeout", "setInterval"]);
        return {
          CallExpression(node) {
            const id = node.callee;
            if (id?.type === "Identifier" && forbidCallee.has(id.name)) {
              // allow setTimeout/setInterval only if first arg is not a string
              if ((id.name === "setTimeout" || id.name === "setInterval")) {
                const first = node.arguments[0];
                if (first && first.type === "Literal" && typeof first.value === "string") {
                  ctx.report({ node, message: "String-based timers are forbidden." });
                }
                return;
              }
              if (id.name === "eval") {
                ctx.report({ node, message: "eval is forbidden." });
              }
            }
          },
          NewExpression(node) {
            if (node.callee?.type === "Identifier" && node.callee.name === "Function") {
              ctx.report({ node, message: "new Function is forbidden." });
            }
          }
        };
      }
    },

    "forensic-required": {
      meta: { type: "suggestion", docs: { description: "Mutation paths must create forensic envelope" } },
      create(ctx) {
        // Cheap heuristic: inside functions named save/create/update/delete,
        // we expect a call to ForensicLogger.createEnvelope(...)
        // (Tighten with your code patterns as needed.)
        function hasForensicCall(body) {
          let found = false;
          ctx.getSourceCode().getTokens(body).forEach(tok => {
            if (tok.value === "ForensicLogger" || tok.value === "createEnvelope") found = true;
          });
          return found;
        }
        return {
          FunctionDeclaration(node) {
            const n = node.id?.name || "";
            if (/^(save|create|update|delete)/i.test(n)) {
              if (!hasForensicCall(node.body)) {
                ctx.report({ node, message: `Function '${n}' mutates state without forensic envelope.` });
              }
            }
          },
          MethodDefinition(node) {
            const n = node.key?.name || "";
            if (/^(save|create|update|delete)/i.test(n)) {
              if (node.value?.body && !hasForensicCall(node.value.body)) {
                ctx.report({ node, message: `Method '${n}' mutates state without forensic envelope.` });
              }
            }
          }
        };
      }
    }
  }
};
```

---

# 3) CI scripts (no extra packages)

```
scripts/
  ci/
    scan.js
    jsdoc-check.js
```

**`scripts/ci/scan.js`** – fast regex scan for the worst offenders:

```js
// Node-only, no deps. Quick regex scan supplementing ESLint.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIRS = ["src", "scripts", "tools"];
const BAD = [
  { re: /\beval\s*\(/, why: "eval()" },
  { re: /\bnew\s+Function\s*\(/, why: "new Function()" },
  { re: /\.innerHTML\s*=/, why: "innerHTML assignment" }
];

let failed = false;

function scanFile(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  BAD.forEach(({ re, why }) => {
    if (re.test(txt)) {
      console.error(`[scan] ${fp}: forbidden pattern: ${why}`);
      failed = true;
    }
  });
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "build") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(m?js)$/.test(ent.name)) scanFile(full);
  }
}

for (const d of SRC_DIRS) {
  if (fs.existsSync(d)) walk(path.join(ROOT, d));
}

if (failed) {
  console.error("[scan] FAILED");
  process.exit(1);
} else {
  console.log("[scan] OK");
}
```

**`scripts/ci/jsdoc-check.js`** – minimal “presence” check for public methods:

```js
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = "src";
let missing = [];

function checkFile(fp) {
  const s = fs.readFileSync(fp, "utf8");
  // crude: public methods should have immediate /** before "export class" or method signature
  const classBlocks = s.matchAll(/export\s+class\s+([A-Za-z0-9_]+)\s*\{/g);
  for (const _ of classBlocks) {
    // look for methods: "\n  methodName(" without preceding "/**"
    const lines = s.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^\s*([a-zA-Z0-9_]+)\s*\(/);
      if (m && !/^\s*#/.test(line)) {
        const prev = lines[i - 1] || "";
        if (!prev.includes("/**")) {
          missing.push(`${fp}:${i + 1} missing JSDoc for '${m[1]}'`);
        }
      }
    }
  }
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(m?js)$/.test(ent.name)) checkFile(full);
  }
}

if (fs.existsSync(SRC_DIR)) walk(SRC_DIR);

if (missing.length) {
  console.error("[jsdoc-check] Missing JSDoc on public methods:\n" + missing.map(s => "- " + s).join("\n"));
  process.exit(1);
}
console.log("[jsdoc-check] OK");
```

---

# 4) Husky hook (optional but recommended)

```
.husky/
  pre-commit
```

**`.husky/pre-commit`**

```bash
#!/usr/bin/env bash
set -euo pipefail
npx eslint . --ext .js,.mjs
node scripts/ci/scan.js
node scripts/ci/jsdoc-check.js
npm run test -s || true    # keep optional if you want faster commits
```

(If you don’t use Husky, run the three commands in CI.)

---

# 5) Forensic HUD (dev-only overlay)

```
src/dev/
  ForensicHUD.js
  ForensicHUD.css
```

**`src/dev/ForensicHUD.js`**

```js
/**
 * Dev-only overlay showing security events (infoFlow, cdsEvent, securityEvent).
 * Auto-enables with ?hud=1 or window.__NODUS_HUD__ = true.
 */
export class ForensicHUD {
  constructor(bus) {
    this.bus = bus; // expected to be stateManager (EventEmitter-like)
    this.enabled = /[?&]hud=1/.test(location.search) || globalThis.__NODUS_HUD__ === true;
    if (!this.enabled) return;
    this._mount();
    this._wire();
  }

  _mount() {
    const wrap = document.createElement("div");
    wrap.id = "forensic-hud";
    wrap.innerHTML = `
      <div class="fh-head">
        <strong>Forensic HUD</strong>
        <button id="fh-clear">Clear</button>
        <button id="fh-hide">Hide</button>
      </div>
      <div id="fh-body"></div>`;
    document.body.appendChild(wrap);
    document.getElementById("fh-clear").onclick = () => (document.getElementById("fh-body").innerHTML = "");
    document.getElementById("fh-hide").onclick = () => (wrap.style.display = "none");
  }

  _wire() {
    const log = (type, payload) => {
      const body = document.getElementById("fh-body");
      if (!body) return;
      const el = document.createElement("pre");
      el.textContent = `[${new Date().toISOString()}] ${type}\n` + JSON.stringify(payload, null, 2);
      body.prepend(el);
    };
    this.bus?.on?.("infoFlow", (e) => log("infoFlow", e));
    this.bus?.on?.("cdsEvent", (e) => log("cdsEvent", e));
    this.bus?.on?.("securityEvent", (e) => log("securityEvent", e));
    this.bus?.on?.("forensicEvent", (e) => log("forensicEvent", e));
  }
}
```

**`src/dev/ForensicHUD.css`**

```css
#forensic-hud {
  position: fixed; right: 8px; bottom: 8px; width: 420px; max-height: 50vh;
  background: rgba(10,10,10,.90); color: #e6e6e6; font: 12px/1.4 ui-monospace,monospace;
  border: 1px solid #333; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.45);
  display: flex; flex-direction: column; z-index: 999999;
}
#forensic-hud .fh-head { display:flex; gap:8px; align-items:center; padding:6px 8px; border-bottom:1px solid #2a2a2a; }
#forensic-hud .fh-head button { margin-left: auto; background:#222; color:#ddd; border:1px solid #444; border-radius:6px; padding:4px 8px; cursor:pointer; }
#fh-body { overflow:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
#fh-body pre { margin:0; background:#111; border:1px solid #222; border-radius:6px; padding:6px; }
```

**Wire it in dev only**, near the end of your `main.js` after `HybridStateManager` is created:

```js
if (import.meta.env?.MODE !== "production") {
  const { ForensicHUD } = await import("./dev/ForensicHUD.js");
  await import("./dev/ForensicHUD.css", { assert: { type: "css" } }).catch(() => {});
  new ForensicHUD(stateManager); // assumes you have `stateManager`
}
```

(If you don’t have CSS import assertions, include the CSS via a `<link>` in your dev HTML.)

---

# 6) Tiny Vitest example (optional)

**`src/core/security/__tests__/constant-time.spec.js`**

```js
import { constantTimeCheck } from "@/core/security/ct.js";

test("constantTimeCheck pads to >= 100ms", async () => {
  const t0 = performance.now();
  await constantTimeCheck(async () => 42, 100);
  const dt = performance.now() - t0;
  expect(dt).toBeGreaterThanOrEqual(100);
});
```

---

## How to run

* Lint (flat config):
  `npx eslint . --ext .js,.mjs`

* CI scans:
  `node scripts/ci/scan.js`
  `node scripts/ci/jsdoc-check.js`

* Dev HUD: open app with `?hud=1` or set `window.__NODUS_HUD__ = true` in the console.

---

If you want, I can tailor the ESLint “forensic-required” rule to your exact mutation sites (file globs + method names), or wire the HUD to your existing EventBus signature.
