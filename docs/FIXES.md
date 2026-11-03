# Correctness and release fixes

This patch addresses the six reported issues while retaining the PHP/React architecture, role permissions, transactional JSON store and existing page layouts. Operational data is not bundled in the release. Migration instructions are in [MIGRATION.md](MIGRATION.md), and reproducible packaging instructions are in [RELEASE.md](RELEASE.md).

## Changes

1. **Roster editing snapshots:** requirement values and their base version stay together. Dirty forms preserve input when newer data arrives, show a conflict/reload notice and submit their original version. A 409 retains the work. Explicit reload and successful saves establish a new baseline; the mutation response remains authoritative even if the following bootstrap refresh fails. Controls prevent input loss during an in-flight save.
2. **Availability concurrency:** every save requires the current staff/week version. Missing tokens fail validation and stale tokens return 409 before any mutation. The PHP form preserves unsaved choices on conflict. Legacy snapshots read as version zero without being rewritten; accepted saves initialize and advance the token inside the existing transaction.
3. **Password policy:** one shared class enforces explicit bcrypt at cost 12, a 12–72 byte creation/reset limit and no NUL bytes. Authentication preserves existing supported hashes, including older short passwords, while oversized inputs receive reset guidance. The reset CLI advances a credential version so old sessions fail on their next request. No automatic rehash or suffix recovery is claimed.
4. **Report refresh:** the header refresh includes the active filtered report. Business revision changes trigger background revalidation. Request sequencing and cancellation stop older responses replacing newer results; filters, loading and errors remain visible. Exports/printing are unavailable while a report has an unresolved loading/error state. Queued chart resize callbacks safely ignore an unmounted chart during refresh/navigation.
5. **Idle-session behavior:** automatic revision-dependent preview/report requests carry the background header. Genuine navigation, filter changes, retries and manual refresh remain foreground activity. Server idle and absolute timeouts still apply.
6. **Release packaging:** a dependency-free builder selects approved source, lockfile, fixtures and manifest-referenced build assets. It excludes operational state, backups, receipts, sessions, local secrets, installed dependencies and local evidence. Deterministic ZIP bytes, path checks, a content scan and checksum verification guard the release; existing operational files are never deleted or modified by packaging.

## Validation

Executed on 21 October 2026 with PHP 8.5.11, Node 24.19.0 and Chrome 155. Workflow tests used synthetic isolated stores and sessions. The supplied operational state's SHA-256 matched the pre-edit baseline after all workflow tests. No operational credentials were read or reset for these fixes.

| Check (from project root unless stated) | Final result |
| --- | --- |
| `php tests/run.php` | 30 groups passed, 0 failed |
| `node tests/e2e/http.mjs` | 18 groups passed, 0 failed |
| `node tests/e2e/subdirectory.mjs` | 8 groups passed, 0 failed |
| `php -l` over source in src/public/scripts/tests/config, excluding tests/.tmp | 35 files passed, 0 failed |
| `npm run build` from frontend | Passed; Vite 7.3.7, 1,599 modules; main-CcinXWQc.js, 349,100 bytes (107,263 gzip) |
| `node tests/e2e/regressions.mjs` | 7 groups passed, 0 failed; zero unhandled page errors/PHP warnings |
| `node tests/e2e/browser.mjs` | 12 groups passed, 0 failed against the final build |
| `node tests/e2e/browser-safety.mjs` | 3 groups passed, 0 failed against the final build |
| `node tests/package-release.mjs` | 8 isolated packaging groups passed, 0 failed |
| Prettier checks over frontend/src, Vite config, package metadata, new browser regressions and packaging source/tests | Passed |
| `node --check` for useApi.js, api.js, dates.js and regressions.mjs | Passed |

The new browser cases use separate sessions/tabs to verify a dirty roster's original version survives automatic polling and receives 409, saved baselines survive a failed follow-up bootstrap, a cross-lab swap changes an already-open Lab A report and its exact CSV rows, older filter responses cannot win, report errors preserve filters and block stale exports, and availability tabs reject both different-cell and same-cell stale saves. The unattended-page test observed 14 automatic reads, all with the background header, and two explicit refresh reads, both foreground; idle expiry still occurred. HTTP checks additionally verify absolute expiry and reset-session invalidation.

There is no standalone ESLint configuration or lint script in this project, so no ESLint pass is claimed. The available formatting, JavaScript syntax, JSX build and React review checks were completed. Subdirectory routing uses a PHP Alias simulation; production Apache configuration and manual real-device/browser-toolbar zoom checks were not performed. No public sign-in or production deployment was part of this patch.

During regression testing, the new unhandled-error assertion exposed a queued Canvas resize callback after chart unmount. The guard was fixed, the production build was regenerated and both the new regression suite and existing browser suites passed against that final build. Local evidence JSON is retained in the development workspace and excluded from the release.

## Changed files

New source files:

```text
src/Passwords.php
scripts/reset-password.php
scripts/package-release.mjs
tests/e2e/regressions.mjs
tests/package-release.mjs
```

Updated application and test files:

```text
src/Auth.php
src/Demo.php
src/Domain.php
src/Store.php
scripts/create-user.php
public/api/index.php
public/availability.php
public/assets/js/availability.js
frontend/src/App.jsx
frontend/src/components/Roster.jsx
frontend/src/hooks/useApi.js
frontend/src/pages/Reports.jsx
frontend/src/pages/Swaps.jsx
tests/run.php
tests/e2e/http.mjs
tests/e2e/subdirectory.mjs
```

Rebuilt output: `public/build/.vite/manifest.json` and `public/build/assets/main-CcinXWQc.js`, replacing `main-Ch5PC_a6.js`. The lockfile and installed dependency versions are unchanged.

Updated guides/conventions: `README.md`, `AGENTS.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DEPLOYMENT.md`, and this new `docs/FIXES.md`, plus new `docs/MIGRATION.md` and `docs/RELEASE.md`.

Workspace-only request/history/evidence updates: `docs/FIX_REQUEST.txt`, `docs/PROGRESS.md`, `docs/TEST_RESULTS.md`, `docs/FIX_BACKEND_RESULTS.json`, `docs/FIX_FRONTEND_RESULTS.json`, `docs/HTTP_RESULTS.json`, `docs/BROWSER_RESULTS.json`, `docs/BROWSER_SAFETY_RESULTS.json`, and refreshed isolated browser screenshots. These local files are excluded from the sanitized ZIP. Private source baselines and temporary test artifacts are also excluded.

## Deployment and compatibility

Deploy PHP and compiled assets together and reload existing tabs/forms. Availability API callers must fetch and supply the new staff/week version. No bulk state migration or reseed is needed. Existing accounts/hashes remain in place; oversized legacy bcrypt passwords need an explicit administrative reset. If an earlier ZIP distributed credentials or sessions, rotate the affected credentials and invalidate those sessions using MIGRATION.md. A new installation from this sanitized archive must provision fresh accounts or explicitly generate a fictional demo.
