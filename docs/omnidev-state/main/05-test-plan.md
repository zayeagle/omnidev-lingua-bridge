---
version: 9
artifact: 05-test-plan.md
complexity: M
profile: frontend-only-M
last_updated: 2026-07-18T14:32:00+08:00
history_ref: 05-test-plan-history.md
---

# Test Plan — Security re-audit #3

| Layer | Required | Scope |
|-------|----------|-------|
| UNIT | yes | isExtensionPageSender requires runtime.id; sanitize multi-secret; resolve reason locked vs missing |
| INT | yes | background: locked vault → no Libre; security.unlock wrong id denied |
| E2E | no | manual SMK: options unlock → provider translate works after SW path |
| SMK | yes | `npm test` + `npm run build` + `assert:content` + zip |
| REG | yes | prior vault/messaging suites still green |

## Cases (compact)

| ID | Layer | Case | Expect | Result |
|----|-------|------|--------|--------|
| TC-S3-U01 | UNIT | sender id mismatch → not extension page | false | PASS |
| TC-S3-U02 | UNIT | sanitize redacts iflytekApiSecret | [REDACTED] | PASS |
| TC-S3-U03 | UNIT | resolve locked vault → reason locked | no free implied | PASS |
| TC-S3-I01 | INT | background locked + ai.translate | error unlock; no Libre call | PASS |
| TC-S3-I02 | INT | security.unlock sender.id wrong | denied | PASS |
| TC-S3-R01 | REG | messages/storage/crypto suites | pass | PASS |
| TC-S3-S01 | SMK | test + build + assert + pack | pass | PASS |

