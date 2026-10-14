# R7b native browser evidence

Actual Next standalone build source `4bed3a37403a3fb2f8c6f73a01f388337130c311`, built UTC `2026-10-14T23:09:50.263Z`. The later test-only commit corrected its expected safe login return URL. Subsequent unpublished branch replay includes parent R3b fixes; health code is unchanged. Final-head CI is separate and pending.

System Chromium / Pixel7 emulation, viewport390×844, native CSS-pixel section screenshots in FA/TR/EN. These are unchanged actual PNG captures, not mockups or image edits. Synthetic owned PostgreSQL fixtures intentionally include delayed QUEUED/RUNNING, REVIEW/PROVIDER_UNKNOWN and FAILED/OTHER. Guarded immutable session history is retained in that test DB; no deletion trigger or monetary guard was weakened. Missing local provider credential is not evidence about the owner's environment.

Local: production build and lint/typecheck passed; two PostgreSQL cases passed (real missing/scoped permission rejection, boundary delay, redaction, unchanged session/job/ledger digest, zero network); two native browser cases passed in7.1s (password+MFA, actual safe return, three languages, no overflow/no external provider request, signed-in denied actor404 with no diagnostic content). Browser code/assertions were run directly against the real app and DB. No provider or storage endpoint was probed.

CI: fresh final-head four jobs/full suite/restore still required. NOT_VERIFIED: owner Windows runtime, cron heartbeat, owner storage/provider connection and historical root cause, independent D70 review and owner/device acceptance. Online R0 BLOCKED_ENV; R7c BLOCKED_BUDGET_ADR. No merge/main push/owner data change.

- [فارسی](fitting-health-fa.png)
- [Türkçe](fitting-health-tr.png)
- [English](fitting-health-en.png)
