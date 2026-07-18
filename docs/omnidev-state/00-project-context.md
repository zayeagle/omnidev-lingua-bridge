# Project Context — omnidev-lingua-bridge

```yaml
project_type: greenfield
project_structure: frontend-only
stability_level: standard
branch: main
updated: 2026-07-18
```

## Stack & Layers

| Layer | Choice (proposed) | Notes |
|-------|-------------------|-------|
| Product | Browser extension (Chrome MV3 + Firefox) | Greenfield; only README/LICENSE exist |
| Framework | WXT (selected Phase 1 Approach A) | Cross-browser build + HMR |
| Language | TypeScript | Strict typing for content/background |
| UI (options/popup) | Lightweight React or vanilla | API key once; master toggle; auto lang |
| Page translate | Content script + MutationObserver | EN↔ZH text nodes |
| Speech pipeline | Prefer in-page video capture → STT → translate → caption | Fallback: one tab-permission prompt |
| AI | User-configured API key (OpenAI-compatible first) | Text + speech/STT |

## Dependency Topology

| Category | Dependency | Role |
|----------|------------|------|
| Storage | `chrome.storage` / `browser.storage` | API key, prefs (local) |
| Third-Party | AI HTTP APIs (user key) | Translation, STT/TTS as needed |
| Browser APIs | content scripts, optional `tabCapture` / media | Page DOM + video audio |
| Packaging | WebExtension polyfill / WXT targets | Chrome + Firefox artifacts |

No DB / MQ / backend in scope (client-side extension; AI calls from extension or optional proxy TBD).

## Stability Level

`standard` — personal productivity extension; not HA/multi-tenant SaaS.

## Domain Knowledge

- Cross-browser extension needs MV3 (Chrome) + Firefox WebExtensions alignment; permissions differ for media.
- Page translation: walk text nodes, skip `<script>`/`<style>`/inputs; re-translate on DOM mutations.
- Video speech: hardest path — audio source (tab vs element), streaming STT latency, bilingual caption UX.
- API keys must never be logged; prefer `storage.local` + optional encrypt-at-rest later.
- Phase 0 confirmed L (2026-07-18): full workflow; speech path is the critical path for schedule risk.
- Greenfield extension: prefer one meta-framework (WXT/Plasmo) over hand-rolled dual-browser packaging.
- Approach A locked: WXT modules popup/options/background/content + ai-client + speech-pipeline + caption-ui.
- Open questions resolved: captions; OpenAI-compatible; viewport incremental; video-first audio; auto-on when Key set.
- Phase 2: F1 settings → F2 AI → F3 page → F4 speech → F5 CI; test profile frontend-only-L (vitest+playwright).
- Autopilot 2026-07-18: G3–G5 landed; content wires viewport translate + video captions; deploy via `make deploy`.
- API Key threat model (2026-07-18): Key stays in `storage.local`; AI HTTP only from background; content uses runtime messages; errors sanitized. Residual: user-chosen Base URL receives Key; local profile/malware can read storage; no encrypt-at-rest.
- API Key hardening shipped: `local:publicPrefs` for content; options mask + keep-on-empty; always sanitize outbound errors.
- Content must import `lib/public-prefs.ts` only (not settings-store) so the content bundle never embeds `local:settings` / `apiKey` strings.
- Residual Key risks (deep audit): phishing/custom Base URL, plaintext storage.local, http MITM, AI message quota abuse; pages cannot read raw Key under current isolation.
- Deep hardening shipped: https-only Base URL + trust ack; hasApiKey prefs; popup keyless; AI rate-limit; assert:content in pack/CI.
- Encrypt-at-rest + auto-unlock (2026-07-18): passphrase remembered in `storage.local` so SW restores session after browser restart; same local threat as plaintext if profile is stolen.
- Optional API Key (2026-07-18): free path = Chrome Translator → LibreTranslate; speech = Web Speech + speechSynthesis; AI path when Key configured.
- UI (2026-07-18): light sky/teal popup+options; bright rounded icons via gen-icons (not dark slate).
- Page UX default: selection bubble (translate / explain / page oneshot); full-page auto optional via popup; toast 4s+close; video SI unchanged.
- iFlytek (2026-07-18): user has STT+MT+TTS packs on app「星火API测试体验rd2rx5」; plugin cannot use them via OpenAI `/v1/audio/*` — needs native HMAC/WS adapters (Phase 0 → M).
- iFlytek design: provider preset + background-only clients — STT WSS mul_cn (≤60s chunk), MT `itrans.xfyun.cn/v2/its`, TTS 超拟人 WSS; OpenAI/free paths kept.
- Security re-audit 2026-07-18 #2 (v0.4.17): no Critical; High = rememberedPassphrase + plaintext iflytekApiSecret; Medium = message limits / security.* rate-limit / query auth / incomplete vault clear.
- Security harden scope (Phase 0 M): vault secrets properly; validate AI payloads; restrict security.* to extension pages.
- Security harden 0.4.18: no rememberedPassphrase; vault JSON secrets; messaging validators + security gate; session unlock UX.
- Security re-audit #3 (v0.4.18): no Critical; High = options unlock mutates options-world key-session (SW empty → Libre fallback); Medium = weak sender.id check, broad host_permissions, Base URL trust UI-only, Libre exfil on fallback, sanitize misses iflytekApiSecret; iFlytek query-auth still protocol-inherent.
- Security fix 0.4.19: options unlock/status via security.* into SW key-session; resolve reason locked → no Libre; sender.id===runtime.id; sanitize multi-secret. Residual backlog: host_permissions, Base URL policy, iFlytek query-auth, Shadow DOM.



## UX Principles (confirmed)

- Minimal user ops: one-time API key + master on/off; no per-page direction picking.
- Auto-detect ZH/EN (page text + speech) and convert to the other language.
- Product scope (locked): Chinese ↔ English only; no other language pairs.
- UI i18n: `public/_locales/{en,zh_CN,zh_TW}` + `lib/i18n.ts` (`t` / `applyDomI18n`); follows browser UI language.
- Speech output: caption overlay (not TTS dubbing) unless later changed.

## Open Questions (Phase 1)

Resolved 2026-07-18 — all defaults accepted; see `main/01-blueprint.md` §7.
