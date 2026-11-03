# ShiftSync implementation progress

## Plan

1. Inspect requirements/environment and define locked storage and domain records.
2. Implement authentication, availability, roster draft/coverage/publication.
3. Implement two-party exchange and atomic supervisor approval.
4. Integrate React workspace, responsive PHP forms and scoped reports.
5. Run isolated tests, production build, HTTP/browser checks; fix observed failures.
6. Complete setup, architecture, API and evaluator documentation.

## Environment inspection

- Initial workspace was empty and not a Git repository; no applicable AGENTS.md found.
- Node v24.19.0 is installed. PHP and npm were not initially on PATH.
- Managed execution runner failed during setup; reviewed elevated commands work.
- Full supplied specification copied to BUILD_SPEC.txt; pasted request preserved in USER_REQUEST.txt.
- Backend core, React workspace and independent verification work are being implemented in parallel.

## Implemented and verified milestones

- Locked JSON storage, strict integrity validation, canonical times, role/session/CSRF protection, ordinary PHP login/logout and progressively enhanced availability are implemented.
- Draft creation/eligibility/coverage/versioning/publication and two-way consent/approval/atomic exchange/history/notices are implemented. Published weeks are immutable except approved exchanges.
- React HashRouter workspace, desktop grid/mobile agenda, candidate explanations, approval comparison, reports/Canvas/table/CSV, notifications and local Bootstrap are integrated. Source has been formatted for readability.
- Secure seed/account/backup/restore/environment CLI commands and runtime launchers are implemented. State and passwords are ignored private files. Production can initialize a clean supervisor account without demo data.
- Architecture, data model, API, setup/deployment, syllabus, viva and demo documentation are written. This specification remains unchanged.

## Executed commands and results (20 October 2026)

- Official PHP 8.5.11 portable download verified SHA-256; npm 11.6.2 registry download verified SHA-512 integrity. Node 24.19.0 already installed.
- `npm install --no-audit --no-fund`: passed; lockfile created. Exact dependency versions in TEST_RESULTS.md.
- `php tests/run.php`: **27 passed, 0 failed** using temporary fixtures, controlled time and independent worker processes. Covers service/security/coverage/swap/storage/CLI/CSV/history-filter rules and published snapshot integrity on read/restore.
- PHP syntax: **32 files passed, 0 failures** after final query validation helper.
- Production `npm run build`: passed after source formatting, Vite 7.3.7, 1,599 modules, manifest generated. Local Bootstrap asset preparation passed.
- Reproducible `npm ci --no-audit --no-fund` passed (73 packages in 41s), followed by another successful production build.
- `php scripts/check-environment.php`: all checks passed after build; wrapper php/npm commands passed.
- `node tests/e2e/http.mjs`: **15 passed, 0 failed** against isolated state/session files and a spawned PHP server, including consistent configured-clock metadata after a browser-discovered fix and query-shape rejection without warnings.
- `node tests/e2e/subdirectory.mjs`: **8 passed, 0 failed** under simulated `/shiftsync` Alias prefix, covering forms/assets/API/CSV/route refresh. Real Apache hosting was not exercised.
- `node tests/e2e/browser.mjs`: **12 browser groups passed, 0 failed**, 14 screenshots captured. Real UI availability/request/acceptance/approval/report/download flows, responsive/focus/reduced-motion/print, three browser timezones and safe CSRF refresh were executed. Actual screenshots were opened for visual review; evidence and scope limitations are in TEST_RESULTS.md.
- `node tests/e2e/browser-safety.mjs`: **3 supplementary groups passed, 0 failed**: clean-page console/network sweep, native availability labels at 320/375/390px, and no replay after aborted/503 mutations with unchanged snapshot. An additional reviewed narrow screenshot brings the total to 15.

## Handover status

- Required local implementation, build, isolated service/CLI/HTTP/subdirectory/browser verification and documentation are complete. No required local blockers remain.
- No public deployment occurred. React Developer Tools and production Apache/HTTPS are not available in the current automated environment.

## Local connectivity follow-up — 20 October 2026

- The user reported `ERR_CONNECTION_REFUSED` after the initial verification server had been stopped. No PHP process was listening on port 8000.
- Restarted the existing PHP application as a hidden background process serving only `public/` at `http://127.0.0.1:8000/`. The application server is intentionally left running for the user's active local session.
- Verified home, login and CSS return HTTP 200; the unauthenticated API correctly returns 401. A real browser rendered the home page and followed its workspace link to the sign-in form without page errors.
- No business records, account credentials, application code, or configuration were changed. A machine restart requires starting the local server again with the documented command.

## User-requested live exchange test — 20 October 2026

- The user explicitly requested execution of the complete swap workflow on the running demo. A private backup was saved first; no reset/reseed occurred.
- Completed fresh request **swap-00006** through the real React/PHP UI: Ananya submitted, Divya accepted, and the supervisor approved. Nine browser verification groups passed.
- Request and acceptance left every assignment unchanged. Approval changed assignment-00013 (27 October afternoon Lab A) from Ananya to Divya, and assignment-00017 (28 October morning Lab A) from Divya to Ananya; both versions changed 1 → 2.
- Reload verified saved owners, approved history, notices, unchanged times/labs/other assignments, complete coverage and unchanged scheduled hours. The exchange remains approved in live storage; the server remains running.
- Detailed evidence and screenshots: LIVE_SWAP_TEST.md and LIVE_SWAP_RESULTS.json. Earlier regression test results remain isolated-store evidence and are distinct from this deliberate live demonstration.
- An independent read-only comparison against the pre-workflow backup passed 11/11 persisted-state checks, confirming the same owners, versions, exactly-once history/notices, and unchanged other records/coverage/workload.

## User-authorized Cloudflare preview — 21 October 2026

- The user requested a shareable Cloudflare Tunnel preview. Installed the official cloudflared 2026.10.2 binary under ignored .tools/cloudflared and verified its published SHA-256 digest.
- Restarted ordinary localhost port 8000 if needed. The share-preview.ps1 helper starts a separate hidden PHP origin on 8001 with forced Secure cookies and cloudflared HTTP/2; both are intentionally left running for sharing.
- Public URL: https://circuits-foster-ability-tournament.trycloudflare.com . Existing sign-in, CSRF, sessions and private JSON persistence remain in effect; no business records or credentials were changed.
- Added explicit HTTPS-proxy cookie configuration without trusting forwarded headers. Added preview-only file routing for honest 404 responses and public-root confinement; unknown paths previously fell back to the introduction page.
- Final public checks passed 26/26. Anonymous real-browser rendering/cookie/redirect checks passed over HTTPS and ordinary localhost HTTP. Existing isolated HTTP authentication/workflow regressions passed 15/15 after the configuration change.
- Automatic approval review blocked sending stored demo credentials through the external tunnel for authenticated sign-in testing. No such credentials were submitted; remaining verification used anonymous public requests and isolated localhost test accounts.
- Start/stop instructions and verification details: docs/PREVIEW.md. Temporary link lifetime depends on the computer/network/PHP/cloudflared processes; no permanent production deployment was configured.
- The isolated HTTP suite additionally passed 15/15 with `--router`, exercising the new preview routing with synthetic localhost-only accounts. Reusing share-preview.ps1 returned the same active URL; both preview background processes remained running and the external login page returned 200 with Secure cookies.

## ChatGPT cloud-browser block investigation — 21 October 2026

- The user reports that the public `/login.php` URL shows “Your request was blocked” in ChatGPT's cloud computer before the form loads.
- Fresh public HTTP checks returned 200 with the real sign-in form, no blocked text and no Cloudflare challenge. Anonymous Chrome over the same public HTTPS URL rendered the form with zero page errors or failed responses. Evidence: CLOUD_BROWSER_DIAGNOSTIC.json and screenshots/cloudflare-block-diagnostic.png.
- Both local origins are reachable. The exact blocked wording is absent from application response code and the inspected origin logs. Existing logs cannot identify a particular cloud-browser attempt, so these observations do not establish which upstream service rejected that user's request.
- The user's ChatGPT cloud computer and its site permissions are not accessible from this workspace. Cloud-browser access remains unverified; a screenshot or provider/error identifier from the blocked page is needed to distinguish a ChatGPT permission/safety decision from a Cloudflare response specific to that network.
- No application behavior, access controls, tunnel hostname, credentials or business records were changed. The anonymous browser check confirmed the stored business snapshot remained byte-identical. The existing local server and shared tunnel remain running.

## Requested correctness and packaging fixes — 21 October 2026

The complete request is preserved in FIX_REQUEST.txt. Work is scoped to six issues: roster editing snapshots, weekly availability concurrency, password byte limits, report invalidation, background-request inactivity behavior, and safe release packaging.

1. Record a source baseline and operational-state hash; inspect the affected paths.
2. Implement backend concurrency/password changes and React editing/refresh changes with isolated regressions.
3. Add an allowlist-based release builder and packaging regressions without operational-data cleanup.
4. Run the backend, HTTP, subdirectory, browser, syntax and frontend-build checks; document executed outcomes and migration steps.
5. Deliver a sanitized patched-project archive and changed-file report.

Source inspection confirmed that roster requirement fields outlive their original version; availability saves lack a concurrency token; account creation permits bcrypt inputs beyond 72 bytes; report fetches are independent of workspace refresh; and revision-dependent previews default to foreground requests. A source-only baseline is private under tests/.tmp; no operational records have been changed for these fixes.

All six fixes are implemented. Dirty roster snapshots now retain their base version and input; availability saves require per-staff/week versions checked atomically; password creation/reset uses a shared 12–72 byte bcrypt policy with deliberate legacy reset/session invalidation; active reports and previews refresh coherently with revision-driven reads marked background; and release packaging uses an allowlist with deterministic ZIP/checksum validation.

Executed final validation: 30 service, 18 HTTP, 8 subdirectory, 35 PHP source syntax files, 7 new browser regression groups, 12 existing browser groups, 3 browser safety groups and 8 packaging groups passed with zero failures. Frontend production build, formatting and JavaScript syntax checks passed. No standalone ESLint configuration exists. A report chart resize/unmount error discovered by the new page-error assertion was fixed and the build/browser checks passed after the fix. The final operational-store SHA-256 matches the baseline. Detailed changes, executed commands, limits and migration steps are in FIXES.md, FIX_BACKEND_RESULTS.json, FIX_FRONTEND_RESULTS.json and MIGRATION.md.

Delivered `artifacts/ShiftSync-patched.zip`: 88 entries, 1,346,077 bytes. Its standalone verifier passed; an independent .NET reader checked every manifest file's size and SHA-256 and confirmed that storage contains only two empty placeholders, with zero forbidden runtime/dependency/evidence entries. Rebuilding the frozen selected sources produced identical archive bytes. Evidence and the archive digest are in artifacts/RELEASE_CHECKS.json outside the ZIP. Operational data was excluded and was not changed. Final packaging review strengthened required-file checks for runtime classes, password reset, source modules and static dependencies before this archive was created.
