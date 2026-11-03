# Verification evidence

The original sections below record 20 October 2026 verification. The 21 October patch results are appended at the end and summarized in FIXES.md. These are executed checks, source-reviewed notes and explicit remaining checks; a build alone is not proof of the workflow.

## Runtime and dependencies

Windows CLI PHP **8.5.11** (NTS x64) downloaded from the official PHP distribution. SHA-256 verified: `0ea96e0d2b9b737a6036f05cf4e95c49313faa6d0f27bd97edb2742503f0c043`. Node **24.19.0** was installed in the Codex runtime. npm **11.6.2** was installed locally from its registry package with SHA-512 integrity verification. Local runtimes are ignored under `.tools/` and are not production artifacts. [Official PHP Windows downloads](https://www.php.net/downloads.php?os=windows).

`npm install --no-audit --no-fund` executed successfully: 72 packages initially installed; lockfile generated. Installed frontend versions were Vite 7.3.7, @vitejs/plugin-react 5.2.0, React/React DOM 19.3.1, React Router 7.18.4, Bootstrap 5.3.8, lucide-react 0.468.0. Local Bootstrap CSS/JS/license were copied to `public/assets/vendor/`.

## Service, storage and CLI suite

Executed from `F:\trishanth web prog\ShiftSync`:

```powershell
& '.\.tools\php\php.exe' tests/run.php
```

**PASS: 27 passed, 0 failed** after storage integrity hardening, replacement-failure coverage, history-filter tests and saved published-roster validation. All records were isolated temporary fixtures with a controlled clock. The suite removes its own fixture directory after completion.

Covered canonical date/block UTC generation under Asia/Kolkata, UTC and America/New_York server defaults; adjacent interval behavior; partial/owned/retroactive availability; unknown availability rejection; draft/published assignment protection; active staff/role/duplicate/cross-lab overlap/capacity rules; technician minima; stale drafts; publication and one notice per staff; both-direction candidate evaluation; creation/acceptance unchanged owners; exact operation retries and conflicting reuse; wrong actors and reservations; decline/withdraw/reasoned reject; atomic/idempotent approval and audit/notices; incoming availability invalidation; assignment version and expiry protection; read-only derived expiry; DTO privacy; report week/lab/zero-workload/staff scope; CSV formula policy and round-trip quoting; malformed/missing state; failed UTF-8 encoding; full temporary-write followed by simulated replacement failure preserving old bytes; CLI seed overwrite refusal and explicit reset; clean account provisioning/password hashing; backup/validated restore; two independent approval workers; two concurrent reservation creators; independent process lock timeout.

The replacement test subclasses `Store::replaceSnapshot()` to return false after a complete temporary snapshot has been written/flushed/closed. It verifies identical original bytes and temporary-file cleanup. Concurrent tests run separate PHP processes via `proc_open` against the same fixture store. Restored/read published snapshots must also retain all 20 slots and complete person/technician coverage; malformed-but-valid JSON is rejected without replacing the previous destination. Incomplete drafts remain valid.

## PHP syntax and production build

**PASS: 32 PHP files, 0 syntax failures**, covering src/public/scripts/tests/config including the final Input helper. Executed `php -l` for every authored PHP file, excluding temporary e2e state directories. Final environment check also passed, including existing live state integrity.

**PASS: reproducible `npm ci` and production Vite build** after adding Prettier as a development-only formatter and formatting frontend source. Actual commands: Node invoking `.tools/npm/package/bin/npm-cli.js ci --no-audit --no-fund`, then `run build` from `frontend/`, with the Node directory on PATH. The lockfile reinstall added 73 packages in 41 seconds. Vite 7.3.7 transformed 1,599 modules and wrote `public/build/.vite/manifest.json`; the final JavaScript bundle after browser fixes is 345.48 kB (106.12 kB gzip). PHP entry points were preserved. `scripts/prepare-assets.mjs` executed successfully and prepares local Bootstrap CSS/JS/license. Environment check and PowerShell php/npm launchers passed, including current state integrity and generated manifest.

## HTTP integration

Executed with Node 24.19.0: `node tests/e2e/http.mjs`.

**PASS: 15 passed, 0 failed**, using its own temporary state/session files, generated credentials, fixed test clock, random localhost port and spawned PHP server. It checks unauthenticated JSON 401, login and mutation CSRF with exact-state preservation, forged role/availability rejection, ordinary no-JavaScript availability POST/reload, DTO privacy/read-only GETs, draft repair/stale versions/publication, request and acceptance unchanged owners, once-only persisted approval, filtered JSON/CSV consistency, staff export scope, notices/logout and idle expiry. Final checks verify success/error metadata uses the configured server clock and array-shaped queries fail without warnings; browser review found and fixed an earlier clock mismatch. This uses real HTTP and PHP forms/services; independent process concurrency is covered separately in the service suite.

## Integration, browser and final checks

Executed `node tests/e2e/subdirectory.mjs`: **PASS: 8 passed, 0 failed**. An isolated PHP test router simulates an Apache Alias at `/shiftsync`, with private temporary state and `SHIFTSYNC_BASE_PATH=/shiftsync`. Checks cover prefixed public/login actions/assets, both role logins/redirects/cookie paths, manifest-driven compiled assets, authenticated read-only API, ordinary availability save/prefixed redirect, report/CSV staff scope, direct hash refresh shell, and no PHP warnings. The test cleans its fixtures. This verifies application prefix behavior; real Apache configuration and browser JavaScript execution are separate checks.

Executed `node tests/e2e/browser.mjs`: **PASS: 12 browser groups, 0 failed**, with isolated state, sessions, generated credentials and a real localhost PHP server. Sanitized evidence is in `BROWSER_RESULTS.json`; it captured 14 screenshots under `screenshots/`.

The browser workflow covers introduction/login/local assets and login errors, enhanced availability save/reload, keyboard drawer trap/Escape/focus restoration, mobile agenda/menu focus, reduced motion, coverage-gap rejection, explained blocked/eligible candidates, real two-party request/acceptance/approval and persisted owners after reload, report Canvas/table/downloaded CSV consistency, print visibility, three browser timezones, a genuinely rejected CSRF token followed by one safe refresh/retry, empty states and direct hash refresh. Browser review fixed the configured-clock metadata mismatch, misleading request-week header and overly long candidate list. Screenshots of desktop roster, mobile availability/approval/report, candidates, login errors and empty/error states were opened and visually inspected.

Combined viewport, overflow and native-control checks used 320, 360, 375, 390, 414, 768 and 1440 CSS pixels. A 720 CSS-pixel viewport checks reflow equivalent to a 1440-pixel display at 200%; Chrome's toolbar zoom was not manually changed. Timezone contexts Asia/Kolkata, UTC and America/New_York displayed the same institution duty times. The session-expiry event check exercises the interface destination; actual server-enforced idle expiry is separately covered by HTTP. The 503 recovery screenshot uses an intercepted structured API failure; real persistence failures are separately covered by the service suite.

Reviewed examples: [desktop roster](screenshots/04-roster-desktop.png), [mobile availability](screenshots/03-availability-mobile.png), [blocked candidates](screenshots/07-blocked-candidates-desktop.png), [mobile approval](screenshots/09-approval-comparison-mobile.png), [mobile reports](screenshots/11-reports-mobile.png), [login error](screenshots/14-login-error-mobile.png), [empty state](screenshots/12-empty-state-mobile.png), [temporary error](screenshots/13-error-state-desktop.png).

Executed `node tests/e2e/browser-safety.mjs`: **PASS: 3 supplementary groups, 0 failed**, recorded in `BROWSER_SAFETY_RESULTS.json`. Representative public/PHP/React pages produced no console errors, page errors or HTTP failures before deliberate fault injection. All native availability option labels fit at 320, 375 and 390 pixels after a CSS fix. One deliberately aborted notification POST and one structured 503 POST were each sent exactly once with no session-token refresh; the business snapshot stayed byte-identical. Expected console messages from those deliberate failures are recorded separately from clean-page results. The mobile availability capture was refreshed and an additional [320-pixel availability screenshot](screenshots/15-availability-narrow.png) was opened and reviewed, bringing the total to 15 images.

No public deployment was performed. React Developer Tools was not available in the automated browser. Real user devices, manual browser-toolbar zoom, a full WCAG audit and a production Apache/HTTPS host were not exercised.

## Correctness and packaging patch — 21 October 2026

Final executed checks passed: service/storage/CLI 30/30, HTTP 18/18, subdirectory 8/8, source PHP syntax 35/35 files, new browser regressions 7/7, existing browser workflow 12/12, supplementary browser safety 3/3, and isolated packaging 8/8. Frontend production build, available Prettier formatting checks and JavaScript syntax checks passed. No standalone ESLint script/configuration exists, so no ESLint result is claimed.

The final Vite build transformed 1,599 modules and generated main-CcinXWQc.js (349,100 bytes; gzip 107,263). The new clean-page assertion found a chart resize/unmount race during report refresh; it was fixed and the build/new browser suite and existing browser suites were rerun successfully after that change. The latest mobile report screenshot was visually reviewed.

New browser evidence includes two real roster sessions and two availability tabs; 409 input retention and reload; an authoritative saved baseline even after bootstrap failure; cross-lab approval updating an open filtered report with exact CSV agreement; older-response rejection and error recovery; and actual automatic preview/report requests that retain the background flag and cannot keep an idle session alive. All 14 observed automatic reads were background; both explicit refresh reads were foreground. HTTP tests additionally cover absolute expiry and password-reset session invalidation.

All workflow mutations used isolated synthetic state/session directories. The operational state's SHA-256 matched the recorded pre-edit baseline after the tests. No operational credentials were read, rotated or submitted. Exact commands and sanitized details are retained in FIX_BACKEND_RESULTS.json and FIX_FRONTEND_RESULTS.json; existing HTTP_RESULTS.json, BROWSER_RESULTS.json and BROWSER_SAFETY_RESULTS.json contain the final runs. FIXES.md lists the changed files and deployment limits; MIGRATION.md documents legacy availability, password reset and leaked-archive session invalidation.
