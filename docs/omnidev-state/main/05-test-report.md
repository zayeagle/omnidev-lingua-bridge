---
version: 1
artifact: 05-test-report.md
complexity: M
last_updated: 2026-07-18T14:32:00+08:00
---

# Test Report — Security re-audit #3

## Execution Plan
Profile: frontend-only-M | UNIT ✅ INT ✅ E2E skip (plan) | SMK ✅ REG ✅  
Commands: `npm test` · `npm run build` · `npm run assert:content` · `npm run zip`  
Blocking: UNIT + SMK

## Results

| ID | Layer | Result | Notes |
|----|-------|--------|-------|
| TC-S3-U01 | UNIT | PASS | messages.test sender.id |
| TC-S3-U02 | UNIT | PASS | ai-client sanitize multi-secret |
| TC-S3-U03 | UNIT | PASS | resolve-ai-config reason locked |
| TC-S3-I01 | INT | PASS | pipeline-policy allowFreeTextFallback |
| TC-S3-I02 | INT | PASS | sender.id / tab gate |
| TC-S3-R01 | REG | PASS | full suite green |
| TC-S3-S01 | SMK | PASS | test + build + assert + zip 0.4.19 |

## Summary
- Tests: **85 passed** (25 files)
- Gates: UNIT ✅ · INT ✅ · SMK ✅ · REG ✅
- Pack: `.output/omnidev-lingua-bridge-0.4.19-chrome.zip`
- Manual residual: options unlock → provider translate (browser install)

## Gaps
None blocking. E2E not required for this slice.
