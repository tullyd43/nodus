# Nodus Copilot Project Context

The Nodus Platform is a composable, offline-first system integrating data, security, and AI modules.
Core principles:
- Everything is modular, composable, and dependency-free.
- Security enforcement is mandatory: MAC + RBAC + crypto separation.
- Every data write produces a forensic audit envelope.
- All code must comply with DEVELOPER_MANDATES.md sections VI–XIII.

Copilot must:
- Never suggest adding runtime dependencies or unvetted APIs.
- Prefer native Web APIs, IndexedDB, and in-house abstractions.
- Enforce constant-time comparisons and side-channel-safe crypto.
- Keep output concise, well-documented, and aligned to these mandates.


