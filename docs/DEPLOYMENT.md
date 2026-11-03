# Local operation and deployment

No public deployment is authorized or performed. PHP's built-in server is for local development. A real deployment needs maintained PHP 8.3+, HTTPS, a single application server and private persistent writable local storage that supports cooperative flock and snapshot replacement. Do not use static-only hosting, ephemeral function storage, a network-shared filesystem, or multiple writers on different servers for this design.

## Production preparation

Build on a machine with Node/npm: `cd frontend`, `npm ci`, `npm run build`, `cd ..`, `node scripts/prepare-assets.mjs`. Deploy PHP/source/config and compiled `public/build/` plus local `public/assets/`. Normal production requests need no Node process. Resolve the PHP executable from a maintained installation; ignored `.tools/` contains optional local test downloads only.

Use the release builder described in RELEASE.md instead of manually zipping the workspace. It retains the required source, lockfile and build assets while excluding operational data, credentials, sessions, local configuration and installed dependencies. For existing deployments, follow MIGRATION.md: ship PHP and compiled assets together, reload old forms, rotate any previously distributed credentials, and invalidate disclosed sessions. These are deployment steps; implementation tests do not perform them against the operational store.

Set Apache/Nginx's document root to the absolute `ShiftSync/public/` directory. Store source, config, state, backup files and sessions outside that root. Give the PHP account only the required read access and private storage write permission. Do not grant broad world-write access. On Unix start with directories 0700 and files 0600 for private data, adjusted to the actual service account. On Windows set NTFS ACLs for that service identity. Serve HTTPS directly or configure the trusted proxy/server so `HTTPS` accurately indicates secure requests and Secure session cookies are enabled.

Create a private ignored `config/local.php` if overrides are needed, using `config/local.example.php`. `SHIFTSYNC_STORE` changes the state destination and `SHIFTSYNC_BASE_PATH` changes the URL prefix. Back up before maintenance, verify the target filesystem replacement behavior, run `php scripts/check-environment.php`, and create the first production supervisor with `php scripts/create-user.php --initialize-empty --name "Lab Supervisor" --email "supervisor@example.edu" --role supervisor`. Provision remaining staff with the same command without initialization. Do not carry fictional demo accounts into production.

## XAMPP / Apache

Use an Apache virtual host with `DocumentRoot "F:/trishanth web prog/ShiftSync/public"` and a matching `<Directory>` allowing access. XAMPP PHP can run the CLI scripts as `C:\xampp\php\php.exe scripts/check-environment.php`. Never point a virtual host at the repository root. NTS PHP was used for the local CLI server; an Apache module requires an appropriate thread-safe build supplied by that Apache stack. See the [official Windows guidance](https://www.php.net/downloads.php?os=windows).

## Subdirectory installation

For an application at `https://college.example/shiftsync/`, map the Apache alias `/shiftsync/` to the physical `ShiftSync/public/`, keep source/storage outside that alias, and set `base_path` to `/shiftsync` in `config/local.php` (no trailing slash). Restart the PHP service after configuration changes. Vite uses relative compiled asset paths; the PHP URL helper supplies the base prefix for links, API and forms. Hash routes require no rewrite rules.

Smoke check the public page, login form action, availability navigation/save, `/shiftsync/app.php#/roster` direct refresh, vendor/build assets and CSV export. Inspect the network panel for requests missing the prefix. Executed subdirectory evidence is recorded in TEST_RESULTS; instructions alone are not proof a host is configured.

## Backup, restore and incidents

`php scripts/backup.php --output /private/backups/shiftsync-YYYYMMDD.json` reads a validated snapshot under a shared business lock and exclusively creates a new private output. The backup includes hashes and private records. Protect it and retain multiple generations. Stop user traffic before restore, then use `php scripts/restore.php --input /private/backups/shiftsync-YYYYMMDD.json --replace-existing`. Restore validates first and replaces under the exclusive normal lock. Omit the replacement flag for a new store.

Missing/malformed state fails with an honest unavailable response; it is never silently replaced with seed data. Preserve the broken snapshot for investigation and restore a verified backup. Lock timeouts are bounded retry errors. A failed write leaves the previous state; do not delete it to force replacement. If the filesystem cannot safely replace a snapshot, fix the deployment or move to a supported persistent local directory.

The lock/rename design is appropriate to this academic single-host workload. It does not promise database-grade crash recovery or cross-server serialization. A database such as MySQL could be a future persistence enhancement; none is required or used here.
