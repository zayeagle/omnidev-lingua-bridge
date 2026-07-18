

## Archived 2026-07-18 08:58

---
artifact: 05-test-plan.md
test_strategy_profile: frontend-only-L
layers_required: [unit, integration, e2e, smoke, regression]
layers_optional: []
e2e_tool: playwright
e2e_required: true
integration_required: true
unit_gate: blocking
regression_mode: targeted
project_type: greenfield
frontend_impact: yes
last_updated: 2026-07-18T08:41:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan ‚Ä?Lingua Bridge

## Test Strategy Summary

| Layer | Required | Tool | Command / Path | TC Count |
|-------|:--------:|------|----------------|----------|
| UNIT | ‚ú?| vitest | `npm test` | 20 |
| INT | ‚ú?| vitest | `npm run test:int` | 6 |
| E2E | ‚ú?| playwright | `npx playwright test e2e/` | 4 |
| SMK | ‚ú?| ‚Ä?| subset | 5 |
| REG | ‚ú?| vitest | tagged modules | 8 |

## Traceability

| Feature | Task IDs | UNIT | INT | E2E | SMK |
|---------|----------|------|-----|-----|-----|
| F1 | T1‚ÄìT3 | U01‚ÄìU04 | I01 | E01 | S01 |
| F2 | T4‚ÄìT5 | U05‚ÄìU08 | I02 | ‚Ä?| S02 |
| F3 | T6‚ÄìT8 | U09‚ÄìU12 | I03 | E02 | S03 |
| F4 | T9‚ÄìT11 | U13‚ÄìU16 | I04 | E03 | S04 |
| F5 | T12‚ÄìT13 | U17‚ÄìU18 | ‚Ä?| E04 | S05 |

## F1 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F1-U01 | UNIT | Happy | saveAiConfig | valid key+url | persisted | storage mock |
| TC-F1-U02 | UNIT | Err | saveAiConfig | empty key | reject | storage mock |
| TC-F1-U03 | UNIT | Err | setEnabled | no key | stays false + CTA | storage mock |
| TC-F1-U04 | UNIT | Boundary | autoEnable | key becomes valid | enabled=true | storage mock |

## F1 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F1-I01 | INT | Happy | popup‚Üístorage‚Üícontent | toggle on | content receives enabled | wxt fake browser |

## F2 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F2-U01 | UNIT | Happy | translate | EN text | ZH string | fetch mock |
| TC-F2-U02 | UNIT | Err | translate | 401 | friendly error | fetch mock |
| TC-F2-U03 | UNIT | Err | translate | network fail | retry then error | fetch mock |
| TC-F2-U04 | UNIT | Boundary | translate | empty | no HTTP | ‚Ä?|

## F2 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F2-I01 | INT | Happy | content‚Üíbg‚Üíai-client | batch msgs | ordered replies | fetch mock |

## F3 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F3-U01 | UNIT | Happy | lang-detect | ‰∏≠Êñá | zh | ‚Ä?|
| TC-F3-U02 | UNIT | Happy | lang-detect | English | en | ‚Ä?|
| TC-F3-U03 | UNIT | Err | page-translate | AI fail | original kept | ai mock |
| TC-F3-U04 | UNIT | Boundary | collectNodes | input/script | skipped | jsdom |

## F3 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F3-I01 | INT | Happy | viewport batch | EN fixture DOM | nodes swapped | ai mock |

## F4 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F4-U01 | UNIT | Happy | caption-ui | cue | overlay text | jsdom |
| TC-F4-U02 | UNIT | Err | speech-pipeline | capture fail | one toast | media mock |
| TC-F4-U03 | UNIT | Err | speech-pipeline | STT 5xx | queue drop+retry | ai mock |
| TC-F4-U04 | UNIT | Boundary | speech-pipeline | no video | idle | ‚Ä?|

## F4 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F4-I01 | INT | Happy | chunk‚ÜíSTT‚Üítranslate‚Üícue | audio blob | caption shown | ai+media mock |

## F5 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F5-U01 | UNIT | Happy | manifest chrome | build cfg | MV3 perms ok | ‚Ä?|
| TC-F5-U02 | UNIT | Boundary | manifest firefox | gecko id | present | ‚Ä?|

## E2E Flows
| TC-ID | Layer | Flow | Steps (short) | Expected |
|-------|-------|------|---------------|----------|
| TC-E2E-01 | E2E | First-run settings | load ext ‚Ü?options ‚Ü?save Key ‚Ü?popup on | enabled |
| TC-E2E-02 | E2E | Page translate | open fixture EN page ‚Ü?enable | visible ZH text |
| TC-E2E-03 | E2E | Captions | fixture page+video ‚Ü?enable | caption overlay |
| TC-E2E-04 | E2E | Firefox pack | build firefox ‚Ü?load | popup renders |

## Smoke Suite
| TC-ID | Source-TC | Layer | Critical Path |
|-------|-----------|-------|---------------|
| TC-SMK-01 | TC-E2E-01 | E2E | Key + enable |
| TC-SMK-02 | TC-F2-U01 | UNIT | translate happy |
| TC-SMK-03 | TC-E2E-02 | E2E | page translate |
| TC-SMK-04 | TC-E2E-03 | E2E | captions |
| TC-SMK-05 | TC-F5-U01 | UNIT | chrome manifest |

## Regression Suite
| TC-ID | Layer | Module | Package | Type |
|-------|-------|--------|---------|------|
| TC-REG-settings-01 | REG | settings | ext | UNIT |
| TC-REG-ai-01 | REG | ai-client | ext | UNIT |
| TC-REG-page-01 | REG | page-translate | ext | UNIT |
| TC-REG-lang-01 | REG | lang-detect | ext | UNIT |
| TC-REG-speech-01 | REG | speech-pipeline | ext | UNIT |
| TC-REG-caption-01 | REG | caption-ui | ext | UNIT |
| TC-REG-msg-01 | REG | background | ext | INT |
| TC-REG-e2e-settings | REG | settings | ext | E2E |


---
## Archive 2026-07-18T09:23:24+08:00 °™ superseded by API Key deep hardening (M)

---
artifact: 05-test-plan.md
test_strategy_profile: frontend-only-L
layers_required: [unit, integration, e2e, smoke, regression]
layers_optional: []
e2e_tool: playwright
e2e_required: true
integration_required: true
unit_gate: blocking
regression_mode: targeted
project_type: greenfield
frontend_impact: yes
last_updated: 2026-07-18T08:41:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan ‚Ä?Lingua Bridge

## Test Strategy Summary

| Layer | Required | Tool | Command / Path | TC Count |
|-------|:--------:|------|----------------|----------|
| UNIT | ‚ú?| vitest | `npm test` | 20 |
| INT | ‚ú?| vitest | `npm run test:int` | 6 |
| E2E | ‚ú?| playwright | `npx playwright test e2e/` | 4 |
| SMK | ‚ú?| ‚Ä?| subset | 5 |
| REG | ‚ú?| vitest | tagged modules | 8 |

## Traceability

| Feature | Task IDs | UNIT | INT | E2E | SMK |
|---------|----------|------|-----|-----|-----|
| F1 | T1‚ÄìT3 | U01‚ÄìU04 | I01 | E01 | S01 |
| F2 | T4‚ÄìT5 | U05‚ÄìU08 | I02 | ‚Ä?| S02 |
| F3 | T6‚ÄìT8 | U09‚ÄìU12 | I03 | E02 | S03 |
| F4 | T9‚ÄìT11 | U13‚ÄìU16 | I04 | E03 | S04 |
| F5 | T12‚ÄìT13 | U17‚ÄìU18 | ‚Ä?| E04 | S05 |

## F1 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F1-U01 | UNIT | Happy | saveAiConfig | valid key+url | persisted | storage mock |
| TC-F1-U02 | UNIT | Err | saveAiConfig | empty key | reject | storage mock |
| TC-F1-U03 | UNIT | Err | setEnabled | no key | stays false + CTA | storage mock |
| TC-F1-U04 | UNIT | Boundary | autoEnable | key becomes valid | enabled=true | storage mock |

## F1 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F1-I01 | INT | Happy | popup‚Üístorage‚Üícontent | toggle on | content receives enabled | wxt fake browser |

## F2 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F2-U01 | UNIT | Happy | translate | EN text | ZH string | fetch mock |
| TC-F2-U02 | UNIT | Err | translate | 401 | friendly error | fetch mock |
| TC-F2-U03 | UNIT | Err | translate | network fail | retry then error | fetch mock |
| TC-F2-U04 | UNIT | Boundary | translate | empty | no HTTP | ‚Ä?|

## F2 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F2-I01 | INT | Happy | content‚Üíbg‚Üíai-client | batch msgs | ordered replies | fetch mock |

## F3 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F3-U01 | UNIT | Happy | lang-detect | ‰∏≠Êñá | zh | ‚Ä?|
| TC-F3-U02 | UNIT | Happy | lang-detect | English | en | ‚Ä?|
| TC-F3-U03 | UNIT | Err | page-translate | AI fail | original kept | ai mock |
| TC-F3-U04 | UNIT | Boundary | collectNodes | input/script | skipped | jsdom |

## F3 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F3-I01 | INT | Happy | viewport batch | EN fixture DOM | nodes swapped | ai mock |

## F4 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F4-U01 | UNIT | Happy | caption-ui | cue | overlay text | jsdom |
| TC-F4-U02 | UNIT | Err | speech-pipeline | capture fail | one toast | media mock |
| TC-F4-U03 | UNIT | Err | speech-pipeline | STT 5xx | queue drop+retry | ai mock |
| TC-F4-U04 | UNIT | Boundary | speech-pipeline | no video | idle | ‚Ä?|

## F4 ‚Ä?INT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F4-I01 | INT | Happy | chunk‚ÜíSTT‚Üítranslate‚Üícue | audio blob | caption shown | ai+media mock |

## F5 ‚Ä?UNIT
| TC-ID | Layer | Type | Target | Input | Expected | Mock |
|-------|-------|------|--------|-------|----------|------|
| TC-F5-U01 | UNIT | Happy | manifest chrome | build cfg | MV3 perms ok | ‚Ä?|
| TC-F5-U02 | UNIT | Boundary | manifest firefox | gecko id | present | ‚Ä?|

## E2E Flows
| TC-ID | Layer | Flow | Steps (short) | Expected |
|-------|-------|------|---------------|----------|
| TC-E2E-01 | E2E | First-run settings | load ext ‚Ü?options ‚Ü?save Key ‚Ü?popup on | enabled |
| TC-E2E-02 | E2E | Page translate | open fixture EN page ‚Ü?enable | visible ZH text |
| TC-E2E-03 | E2E | Captions | fixture page+video ‚Ü?enable | caption overlay |
| TC-E2E-04 | E2E | Firefox pack | build firefox ‚Ü?load | popup renders |

## Smoke Suite
| TC-ID | Source-TC | Layer | Critical Path |
|-------|-----------|-------|---------------|
| TC-SMK-01 | TC-E2E-01 | E2E | Key + enable |
| TC-SMK-02 | TC-F2-U01 | UNIT | translate happy |
| TC-SMK-03 | TC-E2E-02 | E2E | page translate |
| TC-SMK-04 | TC-E2E-03 | E2E | captions |
| TC-SMK-05 | TC-F5-U01 | UNIT | chrome manifest |

## Regression Suite
| TC-ID | Layer | Module | Package | Type |
|-------|-------|--------|---------|------|
| TC-REG-settings-01 | REG | settings | ext | UNIT |
| TC-REG-ai-01 | REG | ai-client | ext | UNIT |
| TC-REG-page-01 | REG | page-translate | ext | UNIT |
| TC-REG-lang-01 | REG | lang-detect | ext | UNIT |
| TC-REG-speech-01 | REG | speech-pipeline | ext | UNIT |
| TC-REG-caption-01 | REG | caption-ui | ext | UNIT |
| TC-REG-msg-01 | REG | background | ext | INT |
| TC-REG-e2e-settings | REG | settings | ext | E2E |


---
## Archive 2026-07-18T09:34:48+08:00 °™ encrypt+UX

---
artifact: 05-test-plan.md
test_strategy_profile: frontend-only-M
layers_required: [unit, smoke, regression]
layers_optional: [e2e]
e2e_tool: playwright
e2e_required: false
integration_required: false
unit_gate: blocking
regression_mode: targeted
project_type: greenfield
frontend_impact: yes
last_updated: 2026-07-18T09:23:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan ‚Ä?API Key deep hardening

## Test Strategy Summary
| Layer | Required | Command |
|-------|:--------:|---------|
| UNIT | ‚ú?| `npm test` |
| SMK | ‚ú?| `npm run build` + assert-content-no-secrets |
| REG | ‚ú?| secrets / rate-limit / https URL cases |
| E2E | ‚ù?| not fullstack |

## F6‚ÄìF9 UNIT
| TC-ID | Target | Expected |
|-------|--------|----------|
| TC-F6-U01 | validateAiConfig http URL | reject |
| TC-F6-U02 | validateAiConfig https | accept |
| TC-F7-U01 | publicPrefs hasApiKey sync | true when key set |
| TC-F8-U01 | rate limit burst | later calls fail friendly |
| TC-F9-U01 | content bundle | no apiKey / local:settings |


---
archived_at: 2026-07-18T09:46:01+08:00
from: 05-test-plan.md
reason: requirement change ‚Äî optional API key + free translate
---

---
artifact: 05-test-plan.md
test_strategy_profile: frontend-only-M
layers_required: [unit, smoke]
e2e_required: false
unit_gate: blocking
last_updated: 2026-07-18T09:34:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan Èà•?Encrypt + UX

| TC-ID | Target | Expected |
|-------|--------|----------|
| TC-F10-U01 | encrypt/decrypt roundtrip | plaintext restored |
| TC-F10-U02 | wrong passphrase | decrypt fails |
| TC-F11-U01 | deepseek supportsStt | false |
| TC-F12 | manual SMK | one input+datalist per model |
| SMK | build + assert:content | PASS |



---
archived_at: 2026-07-18T10:03:02+08:00
from: 05-test-plan.md
reason: selection-bubble UX
---

---
artifact: 05-test-plan.md
test_strategy_profile: frontend-only-M
layers_required: [unit, smoke]
e2e_required: false
unit_gate: blocking
last_updated: 2026-07-18T09:46:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan Èà•?Optional Key + free translate

| TC-ID | Target | Expected |
|-------|--------|----------|
| TC-F13-U01 | canEnable without Key | true |
| TC-F13-U02 | applyToggle on without Key | enabled true, no error |
| TC-F13-U03 | validateAiConfig allowEmptyKey | ok empty apiKey |
| TC-F14-U01 | free-translate picks AI when credential | uses AI mock |
| TC-F14-U02 | free-translate falls back when no Key | Translator/LT path invoked |
| TC-F15 | SMK manual | no Key: page translate works; speech caption if SpeechRecognition |
| SMK | build + assert:content | PASS |


---
archived_at: 2026-07-18T11:32:00+08:00
reason: new_requirement_iflytek_integration
from: 05-test-plan.md
---

---
artifact: 05-test-plan.md
test_strategy_profile: frontend-only-M
layers_required: [unit, smoke]
e2e_required: false
unit_gate: blocking
last_updated: 2026-07-18T10:03:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan Èà•?Selection bubble UX

| TC-ID | Target | Expected |
|-------|--------|----------|
| TC-F17-U01 | default pageMode | selection |
| TC-F17-U02 | normalizePageMode | auto\|selection only |
| TC-F18 | UNIT bubble helpers / SMK manual | bubble actions exist |
| TC-F19-U01 | parse explain JSON | terms array |
| TC-F20-U01 | toast auto + close | dismiss API |
| SMK | build + assert:content | PASS |


---
archived_at: 2026-07-18T14:17:00+08:00
reason: new_requirement_security_harden
from: 05-test-plan.md
---

---
version: 7
artifact: 05-test-plan.md
complexity: M
profile: frontend-only-M
last_updated: 2026-07-18T11:32:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan ‚Äî iFlytek integration

| Layer | Required | Scope |
|-------|----------|-------|
| UNIT | yes | auth signature golden vectors; MT body encode; STT frame status machine; credential validation; provider routing branch |
| INT | yes | mock WebSocket/fetch in background handler for transcribe/translate/speak |
| E2E | optional | smoke: options save iflytek preset; no live keys in CI |
| SMK | yes | `pnpm test` + `pnpm build` + pack assert |

## Cases (compact)

| ID | Layer | Case |
|----|-------|------|
| U1 | UNIT | HMAC authorization string matches fixture |
| U2 | UNIT | iflytek credentials incomplete ‚Üí hasStoredCredential false |
| U3 | UNIT | route: provider iflytek ‚Üí stt/mt/tts; else openai |
| I1 | INT | ai.transcribe with mock WS returns text |
| I2 | INT | ai.translate EN‚ÜíZH via mock ITS |
| S1 | SMK | build + zip assert content no apiSecret strings |

## Out of scope CI
Live xfyun calls (manual with user console keys after pack).



---
archived_from: 05-test-plan.md
archived_at: 2026-07-18T06:27:18.446Z
version: 8
reason: superseded by security re-audit #3
---

---
version: 8
artifact: 05-test-plan.md
complexity: M
profile: frontend-only-M
last_updated: 2026-07-18T14:17:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan ‚Äî Security harden

| Layer | Required | Scope |
|-------|----------|-------|
| UNIT | yes | vault no rememberedPassphrase; iflytek secret encrypted; clearEncryptedVault wipe; message size validators; security sender rules |
| INT | yes | mock background: oversized AI reject; unlock from tab-like sender denied |
| E2E | no | optional manual: options harden save, reload SW, must re-enter passphrase |
| SMK | yes | `npm test` + `npm run build` + `assert:content` |
| REG | yes | existing storage/crypto/route tests still green |

## Cases (compact)

| ID | Layer | Case | Expect |
|----|-------|------|--------|
| TC-S-U01 | UNIT | harden save does not persist rememberedPassphrase | field empty / absent |
| TC-S-U02 | UNIT | iflytek harden ‚Üí aiConfig.iflytekApiSecret empty; cipher holds secret | decrypt round-trip in SW mock |
| TC-S-U03 | UNIT | clearEncryptedVault clears iflytek fields | no residual secret |
| TC-S-U04 | UNIT | texts/audio over limit rejected by validator | false / throw |
| TC-S-I01 | INT | security.unlock with sender.tab set | denied |
| TC-S-I02 | INT | ai.transcribe huge audioBase64 | rate or size error |
| TC-S-R01 | REG | crypto-key + storage + route suites | pass |
| TC-S-S01 | SMK | test + build + assert:content | pass |
