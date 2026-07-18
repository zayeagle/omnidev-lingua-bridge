# Lingua Bridge

**English** | [中文](./README.zh-CN.md)

**Scope: Chinese ↔ English only.** Other languages are not supported.

A Chrome / Firefox extension for page translation and **video simultaneous interpretation** — selection bubbles, bilingual captions, and optional voice playback. No more copy-paste into external tools.

- **UI i18n**: popup, options, and selection bubble follow the browser/OS language (`_locales`: en / zh_CN / zh_TW).
- **API Key optional**: basic page translation works without a key; provider keys make video SI more reliable.

## One-command pack (Windows / Linux / macOS)

Produces installable Chrome + Firefox zips:

```bash
npm run pack:all          # recommended
# Windows:
pack.cmd
# Linux / macOS:
chmod +x pack.sh && ./pack.sh
# or:
make pack
```

Skip tests for a faster pack: `npm run pack:all -- --skip-test` or `./pack.sh --skip-test`

## Install in the browser

Artifacts are **standard extension packages** loaded from the browser’s Extensions page (developer / temporary mode). This is not the same as a permanent Chrome Web Store install (see limitations below).

```bash
npm install             # first time
npm run pack:all
```

Output: `.output/` (`chrome-mv3/`, `firefox-mv2/`, and `*-chrome.zip` / `*-firefox.zip`).

### Chrome / Edge (recommended)

1. Pack with `npm run pack:all` or `pack.cmd`
2. Open `chrome://extensions` (Edge: `edge://extensions`)
3. Enable **Developer mode**
4. Install either:
   - **Recommended**: **Load unpacked** → select `.output/chrome-mv3`
   - Or drag `.output/omnidev-lingua-bridge-*-chrome.zip` onto the extensions page (environment-dependent)

The extension then appears in the toolbar like any other (icon, popup, options).

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on**
3. Pick `manifest.json` under `.output/firefox-mv2`, or the matching `*-firefox.zip`

Temporary add-ons may unload after restart; long-term install usually requires [Firefox AMO](https://addons.mozilla.org/) signing.

### Limitations

| Expectation | Reality |
|-------------|---------|
| One-click “Add to Chrome” without developer mode | Not available until listed on the Web Store |
| Unsigned permanent install on Chrome | Restricted; use Developer mode + Load unpacked |
| Firefox temporary load survives restart | Usually not; AMO signing for permanent install |

## Usage

1. Open the popup and turn on the **master switch** (default: selection bubble; no full-page auto-translate)
2. **Select text** → bubble: **Translate** (with term notes) / **Full page**
3. For video SI: choose **Silent captions** or **Voice interpretation**, then start SI on the page
4. (Optional) Configure an API Key for stronger explain + video-track SI

### Feature matrix

| Capability | Without API Key | With API Key |
|------------|-----------------|--------------|
| Selection translate / explain | Free engine + brief notes | AI translation + term notes |
| Full-page translate | Optional | Optional |
| Video SI | Mic Web Speech (fallback) | Video-track STT + TTS |
| Encrypted vault for secrets | — | Optional |

Toasts fade after ~4s (or dismiss with ×). The free path may send text to a public translation instance — use your own key on sensitive pages.

## API Key security

This extension has **no project backend**. Keys stay in your browser’s extension storage (`storage.local`) and are never uploaded to a Lingua Bridge server.

| Control | Detail |
|---------|--------|
| Isolation | Only the **background** service worker reads keys and attaches `Authorization`; page content scripts never load keys |
| Public prefs | `local:publicPrefs`: `enabled` / `speechMode` / `hasApiKey` (never the raw key) |
| Optional vault | Options → security hardening: PBKDF2 + AES-GCM; **session unlock** with a passphrase (not persisted for auto-unlock) |
| Base URL | **HTTPS only**; non-`api.openai.com` endpoints require an explicit trust checkbox |
| Options UI | Does not refill full secrets; STT/TTS fields only when supported |
| Popup | Reads public prefs only |
| Abuse limits | Background rate-limits `ai.*` per tab |
| Error scrubbing | Responses strip secret substrings |
| Build assert | `npm run assert:content` ensures the content bundle has no `apiKey` / `local:settings` |

**Residual risks (cannot be fully removed by an extension):**

- Keys are sent to the Base URL you configured (phishing endpoints can still steal them — use trusted services only)
- Local malware / tools that read the browser profile may still access `storage.local`
- Do not share screenshots, export packs, or debug logs that contain secrets

## Development

```bash
npm run dev           # Chrome
npm run dev:firefox
npm test
make deploy           # test + dual-browser build
```

## Version

**v0.4.29** — ZH↔EN SI, caption/voice style sync, popup live status when closing the caption panel, UI i18n.
