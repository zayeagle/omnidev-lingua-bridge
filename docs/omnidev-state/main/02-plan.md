---
version: 9
artifact: 02-plan.md
complexity: M
last_updated: 2026-07-18T14:31:00+08:00
history_ref: 02-plan-history.md
---

# Plan — Security re-audit #3

## Assumptions
- Scope: High (SW-only unlock) + Medium fail-closed / sender.id / sanitize. No host_permissions redesign, no iFlytek query-auth rewrite, no Shadow DOM.
- Prior F31/F32 vault+validators remain; this slice fixes residual wrong-world unlock.
- Pack bump after green tests (0.4.19).

## G33 — SW session (F33)
- [x] **T68** `lib/security-client.ts` + options unlock/status/lock via `security.*` only · F33
- [x] **T69** After harden save, options calls `security.unlock` so SW key-session filled · F33
- [x] **T70** UNIT/INT: status/unlock path does not rely on options-world key-session · F33

## G34 — Fail-closed + gates (F34)
- [x] **T71** `resolveAiConfigForRequest` reason `locked`/`missing_key`; background skip Libre when locked · F34
- [x] **T72** `isExtensionPageSender` requires `sender.id === runtime.id` · F34
- [x] **T73** `sanitizeErrorMessage` multi-secret + wire iflytek · F34
- [x] **T74** UNIT/INT TC-S3-* + REG/SMK + version pack · F34
