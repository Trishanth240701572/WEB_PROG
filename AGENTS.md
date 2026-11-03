# ShiftSync project conventions

Read docs/BUILD_SPEC.txt and docs/USER_REQUEST.txt for development scope when present; sanitized releases carry docs/FIXES.md and docs/MIGRATION.md instead of the original attachments and local evidence. This is a plain PHP application; Node only builds React assets. Never expose the project root as the web root: serve public/ only. Keep secrets and state under private storage/ and config/. On 21 October 2026 the user authorized a temporary shareable preview using Cloudflare Tunnel. Permanent production deployment is outside that authorization.

All business changes go through Store::transaction and Domain::command. Never seed during a request. GET requests are read-only. Preserve unknown availability, required staff/week availability versions, roster edit snapshot versions, immutable published weeks, two-direction exchange validation, and atomic/idempotent approval. Account roles and technician qualifications are separate. Use Passwords for password creation/verification and reset-password.php for deliberate resets; never silently truncate bcrypt inputs. Automatic dependent reads must retain the background-refresh flag.

React owns #root; vanilla JavaScript is restricted to the PHP availability page. Use HashRouter, JSX, external CSS, local Bootstrap, institution timezone Asia/Kolkata and UTC duty timestamps. Vite may empty public/build/ only.

Verified patch results are maintained in docs/FIXES.md; the development workspace also keeps docs/PROGRESS.md and docs/TEST_RESULTS.md. Read the available evidence before continuing. Keep documentation accurate; never claim unexecuted tests passed.

Verified from the project root on Windows:

- `scripts/php.ps1 tests/run.php` — isolated service/storage/CLI tests.
- `node tests/e2e/http.mjs` — isolated PHP HTTP workflow tests.
- `node tests/e2e/subdirectory.mjs` — isolated installation-prefix smoke checks.
- `node tests/e2e/browser.mjs` — browser review; requires an available Playwright/Chrome installation as documented in the script.
- `node tests/e2e/regressions.mjs` — isolated multi-session stale-edit, report refresh, request-ordering and idle-session regressions.
- `node tests/e2e/browser-safety.mjs` — isolated page, request-failure and mutation replay checks.
- `node tests/package-release.mjs` — isolated allowlist, reproducibility and archive-integrity regressions.
- `node scripts/package-release.mjs --out artifacts/ShiftSync-patched.zip` — create a new sanitized release, refusing to overwrite an earlier archive.
- `scripts/php.ps1 scripts/check-environment.php` — runtimes, private storage, manifest and local assets.
- From `frontend/`: `../scripts/npm.ps1 ci` then `../scripts/npm.ps1 run build`.
- `node scripts/prepare-assets.mjs` — prepare local Bootstrap after installing dependencies.
- `scripts/php.ps1 -S 127.0.0.1:8000 -t public` — local PHP server, never a static-only preview.

Use normal `php`/`npm` commands on platforms where those runtimes are on PATH. Never run destructive test cases against storage/state.json. Test clocks and test sessions must be explicitly isolated.
