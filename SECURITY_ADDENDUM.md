# Nodus Security Addendum (v1.0)

This addendum defines binding, enforceable security and compliance rules for all Nodus systems.
It extends and operationalizes **DEVELOPER_MANDATES.md**, providing specific enforcement,
verification, and remediation requirements.

---

## 1. Purpose
This document ensures that all source code, configurations, and AI-generated outputs comply with
defense-grade security principles and the Nodus Core Architecture philosophy:
- **No external trust** — every dependency must be verified, minimal, and local.
- **Defense-in-depth** — every layer must validate assumptions from the previous.
- **Audit-first** — all actions must be observable, signed, and immutable.
- **Offline-first** — systems must function securely in disconnected, air-gapped environments.

---

## 2. Enforcement Mechanisms

| Mechanism | Purpose | Enforcement |
|------------|----------|-------------|
| **ESLint (copilot-guard)** | Static enforcement of prohibited APIs and missing forensics | Fails build |
| **CI Scanners (`scripts/ci/scan.js`)** | Regex detection of eval, Function, and unsafe DOM | Fails build |
| **Pre-commit Hook (`.husky/pre-commit`)** | Prevents commits with security violations | Blocks commit |
| **Vitest Security Tests** | Validates constant-time and MAC correctness | Runs per PR |
| **Copilot Agent Rules** | Ensures AI adherence to mandates | Context-level enforcement |

---

## 3. Prohibited APIs & Practices

| Category | Forbidden | Rationale |
|-----------|------------|-----------|
| Code Execution | `eval`, `new Function`, `setTimeout('string')` | Arbitrary code injection |
| DOM Injection | `innerHTML`, `outerHTML`, `insertAdjacentHTML` | XSS vector |
| Network | `fetch`, `XMLHttpRequest` | Must go through approved CDS or gateway |
| Dynamic Imports | `import(url)` | Supply chain risk unless local |
| Browser Storage | `localStorage`, `sessionStorage` | Non-encrypted PII risk |
| Third-party Scripts | Any unverified CDN content | Data exfiltration risk |

All violations trigger ESLint `copilotGuard/no-insecure-api`.

---

## 4. Mandatory Controls

1. **Forensic Envelope Rule (F-01)**  
   Every function performing a write, update, or delete operation must invoke  
   `ForensicLogger.createEnvelope()` prior to state mutation.  
   *Verified by:* `copilotGuard/require-forensic-envelope`.

2. **JSDoc + Test Coverage (D-02)**  
   Every exported function or public class method must include a JSDoc header  
   and be covered by a corresponding unit test.  
   *Verified by:* `copilotGuard/require-jsdoc-and-tests`.

3. **No Runtime Dependencies (S-03)**  
   Only `@core/*` imports and native Web APIs are allowed at runtime.  
   Dev tools may use `vitest`, `playwright`, and `eslint`.  
   *Verified by:* `copilotGuard/no-runtime-dependencies`.

4. **Constant-Time Cryptographic Behavior (C-04)**  
   All MAC and classification comparisons must be padded using `constantTimeCheck`.  
   *Verified by:* Security integration tests.

5. **Audit Integrity (A-05)**  
   Audit logs must use append-only, signed, hash-chained envelopes.  
   *Verified by:* `ForensicLogger` and `NonRepudiation` modules.

---

## 5. Copilot Enforcement Framework

- `.copilot/agent.json` defines the binding AI policies.
- Copilot suggestions must never introduce new runtime dependencies or unsafe APIs.
- All AI-generated modules must pass the ESLint and CI scanners automatically.
- Any deviation from DEVELOPER_MANDATES.md or SECURITY_ADDENDUM.md constitutes a policy violation.

---

## 6. Audit Logging Requirements

- **Each envelope** includes:
  - `actor_id`, `action`, `object_ref`, `label`, `hash(prev_envelope)`, `timestamp`, `signature`.
- **Signatures**: Must use approved algorithms (ECDSA-P256 or Ed25519).
- **Timestamps**: Sourced from trusted monotonic clock or TSA.
- **Anchoring**: Daily anchor hash stored in a verifiable ledger or secure offline medium.

---

## 7. Developer Responsibilities

- Review this document before any code change.
- Ensure each commit passes ESLint, CI scan, and pre-commit hooks.
- Immediately remediate violations.
- Report suspected tampering or CI bypass to the security maintainer.

---

## 8. AI Agent Responsibilities

- Copilot (and other AI tools) must operate in “compliance-first” mode as defined by `.copilot/agent.json`.
- Must cite the relevant mandate section in code comments when generating security-sensitive logic.
- Must never suggest third-party packages, unverified network calls, or direct DOM manipulation.
- Must respect all constraints in Section 3.

---

## 9. Certification Alignment

This security model aligns with:
- **NIST SP 800-53 (Rev.5)** — AC, AU, SC, SI families
- **ISO/IEC 27001:2022** — A.8, A.9, A.12 controls
- **NATO AC/322-D/2004-REV2** — Multilevel security and cross-domain operations
- **ITAR / EAR (Part 744)** — Controlled data handling

---

## 10. Version Control

| Version | Date | Author | Description |
|----------|------|---------|-------------|
| 1.0 | 2025-10-31 | System Architect | Initial formal release |
