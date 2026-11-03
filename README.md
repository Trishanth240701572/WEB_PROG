# ShiftSync

**Duty Roster Management with Coverage Validation and Approved Shift Exchanges**

A single-institution college lab support scheduler built with PHP, private JSON files, React, Vite, Bootstrap and vanilla JavaScript. The local demo uses fictional people and generated private passwords. Staff submit availability and request two-way exchanges; a supervisor builds complete rosters and approves exchanges after checking both people and both labs.

## Requirements

PHP 8.3+ with JSON, sessions, date and file locking; Node 22.12+ with npm for the frontend build; one persistent, writable local filesystem. Node is not a production backend. Point the web document root at `public/`.

Versions installed for this build: PHP **8.5.11**, Node **24.19.0**, npm **11.6.2**, Vite **7.3.7**, React/React DOM **19.3.1**, React Router **7.18.4**, Bootstrap **5.3.8**. The lockfile fixes exact frontend versions. See [fixes and validation](docs/FIXES.md). The original workspace also retains historical test evidence in docs/TEST_RESULTS.md; local evidence is excluded from sanitized releases.

## Start on Windows / PowerShell

Run from the `ShiftSync` directory. PHP/Node/npm on PATH are preferred. This workspace also has optional ignored portable PHP/npm under `.tools/`; the launchers use those when needed. Those downloaded runtimes are local conveniences and are not committed or required on another machine.

```powershell
Set-Location 'F:\trishanth web prog\ShiftSync'
Set-Location frontend
..\scripts\npm.ps1 ci
..\scripts\npm.ps1 run build
Set-Location ..
node scripts/prepare-assets.mjs
scripts/php.ps1 scripts/check-environment.php
scripts/php.ps1 scripts/seed-demo.php --week-start 2026-10-26
scripts/php.ps1 -S 127.0.0.1:8000 -t public
```

The explicit example Monday must still be in the future when run. Omit `--week-start` to use the next complete future work week. This setup refuses an existing state. Open [ShiftSync](http://127.0.0.1:8000/) and [sign in](http://127.0.0.1:8000/login.php). Read generated local accounts privately in `storage/demo-credentials.txt`; the setup command prints only the receipt path. The supervisor email is `supervisor@shiftsync.test`; sample staff emails include `ananya@shiftsync.test` and `arjun@shiftsync.test`.

If Node is not on PATH in this existing Codex workspace, prepare assets with:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/prepare-assets.mjs
```

In XAMPP, use `C:\xampp\php\php.exe` in place of `php` or add that directory to PATH. Configure Apache's document root or alias to `ShiftSync/public`, never `ShiftSync`. See [deployment](docs/DEPLOYMENT.md) for a subdirectory setup.

## Start on Unix-like systems

```sh
cd ShiftSync/frontend
npm ci
npm run build
cd ..
node scripts/prepare-assets.mjs
php scripts/check-environment.php
php scripts/seed-demo.php --week-start 2026-10-26
php -S 127.0.0.1:8000 -t public
```

The frontend uses compiled assets served by PHP at the same origin. Do not run this application through a static-only preview server. Optional frontend watching: `cd frontend && npm run build:watch`, with the PHP server running separately.

## Test

```powershell
scripts/php.ps1 tests/run.php
Get-ChildItem src,public,scripts,tests,config -Filter *.php -Recurse | Where-Object { $_.FullName -notmatch '[\\/]tests[\\/]\.tmp[\\/]' } | ForEach-Object { scripts/php.ps1 -l $_.FullName }
```

```sh
php tests/run.php
find src public scripts tests config -path 'tests/.tmp' -prune -o -name '*.php' -exec php -l {} \;
cd frontend && npm run build
```

Service tests create temporary stores and a fixed test clock; they do not modify the live demo. The concurrency tests launch independent PHP processes against one store. Exact patch validation is recorded in [FIXES](docs/FIXES.md); the development workspace retains the earlier TEST_RESULTS.md as historical evidence. `SHIFTSYNC_ENV=test` plus `SHIFTSYNC_TEST_NOW` is an explicit CLI/local testing facility, never a public parameter.

Additional automated checks: `node tests/e2e/http.mjs` and `node tests/e2e/subdirectory.mjs` spawn isolated PHP servers/stores. Set `PHP_BINARY` if PHP is elsewhere. The subdirectory check simulates an Apache Alias with a test router; it does not configure Apache.

Focused fix regressions: `node tests/e2e/regressions.mjs` exercises separate browser sessions/tabs, report/CSV refresh, request ordering and background expiry using the same optional browser tooling below. `node tests/package-release.mjs` validates packaging using synthetic temporary trees without reading operational data.

Browser checks: `node tests/e2e/browser.mjs` and `node tests/e2e/browser-safety.mjs` use Playwright plus Chrome/Chromium, seed isolated stores and save screenshots under `docs/screenshots/`. They find an existing local/Codex Playwright installation or accept `PLAYWRIGHT_MODULE` pointing to one; `CHROME_PATH` selects an existing browser. These are optional development tools, not application runtime dependencies. On another machine install Playwright in a private tooling directory with `npm install --prefix .tools/browser --no-save --package-lock=false playwright`, point `PLAYWRIGHT_MODULE` at `.tools/browser/node_modules/playwright` using an absolute path, and provide `CHROME_PATH` or install Playwright's Chromium normally. Set environment variables with `$env:NAME='value'` in PowerShell or `export NAME='value'` in a Unix shell.

## Accounts, backups and reset

For a clean production store, provision the first supervisor explicitly rather than seeding demonstration accounts:

```sh
php scripts/create-user.php --initialize-empty --name "Lab Supervisor" --email "supervisor@example.edu" --role supervisor
php scripts/create-user.php --name "New Staff Member" --email "staff@example.edu" --role staff --qualification technician
php scripts/backup.php --output /private/backups/shiftsync.json
php scripts/restore.php --input /private/backups/shiftsync.json
```

Generated account passwords are shown once. `--password-stdin` reads a 12–72 byte password from standard input instead; passwords never go in command arguments. New passwords use bcrypt with cost 12; the limit counts UTF-8 bytes, not characters. `php scripts/reset-password.php --email person@example.edu --password-stdin` resets an existing password and invalidates that account's sessions on their next request. Existing passwords longer than bcrypt's 72-byte limit require a deliberate reset; see [migration and credential recovery](docs/MIGRATION.md).

`--initialize-empty` refuses any existing store. Backups include hashes and private records: keep them outside `public/`, restrict permissions and protect them like live state. Restore validates before acquiring the normal business lock and replacing the snapshot. Replacing an existing state requires `--replace-existing`; make a backup first and stop user traffic during maintenance.

Destructive local demo reset is intentionally explicit: `php scripts/seed-demo.php --reset --week-start YYYY-MM-DD`. This replaces business records; it creates a new timestamped private credentials receipt. Neither setup nor restore deletes the destination to force a replacement. Store path can be set through `SHIFTSYNC_STORE` or ignored `config/local.php`.

## Routes and operating rules

Public PHP pages: `/`, `/login.php`, protected `/app.php`, and staff `/availability.php`. React routes use `/app.php#/overview`, `#/roster`, `#/my-shifts`, `#/swaps`, `#/swaps/new`, `#/swaps/:id`, `#/summary`, `#/notifications`, `#/manage/roster`, `#/manage/staff`, `#/manage/approvals`, and `#/manage/reports`.

Institution time is Asia/Kolkata: Monday–Friday 09:00–12:00 and 13:00–16:00. Unknown availability is never available. Default slots need two people including one technician. Drafts may have gaps; publishing requires every slot to be complete and future. Published blocks, requirements and assignments cannot be directly edited. Only an approved two-way exchange within one published week changes owners, while assignment IDs, times and locations stay fixed. Reports measure scheduled hours, not attendance.

The user authorized a temporary Cloudflare Tunnel preview on 21 October 2026. To share it, run `scripts/share-preview.ps1`; to end sharing, run `scripts/share-preview.ps1 -Stop`. The development workspace retains docs/PREVIEW.md with its temporary URL and historical checks; those local connection details are excluded from releases. Permanent production deployment has not been configured. This is a single-server academic application, with cooperative locks and atomic file replacement on a local filesystem. It is not a distributed database, payroll system or attendance system. There is no automatic optimization, emergency republishing, email/SMS, or multi-institution support.

For a distributable ZIP, use `node scripts/package-release.mjs --out artifacts/ShiftSync-patched.zip` after validation. The builder excludes operational data and installed tooling and refuses to overwrite an earlier archive. See [release packaging](docs/RELEASE.md) and [migration](docs/MIGRATION.md).

See [architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [API](docs/API.md), [syllabus mapping](docs/SYLLABUS_MAPPING.md), [viva guide](docs/VIVA_GUIDE.md), and [evaluator demo](docs/DEMO_SCRIPT.md). The original development workspace retains docs/PROGRESS.md for local history.
