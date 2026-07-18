---
version: 9
artifact: 04-design.md
complexity: M
last_updated: 2026-07-18T14:28:00+08:00
history_ref: 04-design-history.md
---

# Design — Security re-audit #3 (SW session + fail-closed)

## Feature F33: SW-only unlock session (fix wrong JS world)
### Business Context
- **Related**: `key-session`, `settings-store`, `options/main`, `background` `security.*`
- **Impact**: hardening unlock actually enables AI in SW; no silent Libre while UI says unlocked

### Implementation Logic
1. Options **must not** call `unlockWithPassphrase` / `getSecurityStatus` / rely on options-world `setUnlockedVault`. Use `browser.runtime.sendMessage` for `security.unlock` / `security.status` / `security.lock` only.
2. After harden `saveAiConfig` from options (passphrase present): persist cipher in storage, then `security.unlock` so SW `key-session` holds secrets. `saveAiConfig` may still call `setUnlockedVault` when running inside SW; when called from options, vault set is inert for AI — SW unlock is mandatory follow-up.
3. Prefer thin options helpers (`lib/security-client.ts`): `unlockSession`, `fetchSecurityStatus` wrapping messages.
4. Background keep existing `security.*` handlers as SSOT for session memory.

### Edge Cases
- Happy: unlock in options → SW status.unlocked true → translate uses provider | Err: wrong pass | Boundary: SW restart clears session; options shows locked

### Data Changes
| Entity | Change | Details |
| options/main | message-only unlock/status | no direct settings-store unlock |
| security-client (new) | thin RPC | optional |

## Feature F34: Fail-closed + sender.id + secret redact
### Business Context
- **Related**: `background.ts`, `messages.ts`, `ai-client.sanitizeErrorMessage`
- **Impact**: locked vault never Libre-exfils user text; stricter security sender; fewer secret leaks in logs/errors

### Implementation Logic
1. `resolveAiConfigForRequest`: return typed failure `{ ok:false, reason:'locked'|'missing_key', error }` (or equivalent). Background: if `locked` → return error, **no** `freeTextResponse`. If `missing_key` → free path OK.
2. `isExtensionPageSender`: require `sender.id === browser.runtime.id` **and** `sender.tab == null` (F32 leftover).
3. Extend `sanitizeErrorMessage(raw, ...secrets)` to redact apiKey + iflytekApiSecret (+ optional auth query fragments). Wire from ai-handler when iflytek secrets present.
4. Out of this slice: host_permissions tighten, Base URL allowlist, iFlytek query-auth redesign, Shadow DOM.

### Edge Cases
- Happy: no key → Libre | Err: hardened+locked → explicit unlock message | Boundary: wrong sender.id → security denied

### Data Changes
| Entity | Change | Details |
| resolveAiConfigForRequest | reason field | background branch |
| messages.isExtensionPageSender | id check | UNIT update |
| sanitizeErrorMessage | multi-secret | UNIT |

## Out of scope
- iFlytek query-string auth protocol change
- `<all_urls>` / Base URL private-IP policy (backlog)
- Shadow DOM
