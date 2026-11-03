# Architecture

PHP owns authentication, canonical time, business rules and persistence. React is the protected application interface. Vanilla JavaScript enhances the ordinary PHP availability form; that form still submits successfully without JavaScript. Bootstrap's Collapse plugin operates only on the PHP page. No browser cache is a source of business truth.

## Request path

`src/bootstrap.php` loads private configuration and autoloads classes. `Auth::user()` checks server-side session expiry and the current account, then closes the session lock before the business lock. The API reads via `Store::read()` or changes state via one `Store::transaction()`. `Domain::command()` re-resolves the actor from stored users so a submitted role, qualification or actor cannot grant permission. PHP forms use the same Domain service.

`public/api/index.php` is a thin centralized JSON router. `public/handlers/` provides ordinary login, logout and availability POST processing. `public/reports/export.php` renders CSV from the same scoped `Domain::report()` data as the application report.

## Shared business rules

`src/Domain.php` contains focused helpers for assignment reasons, per-slot coverage, published weekly hours, candidate previews, transitions, notifications and audit entries. There are no empty layers merely to match a larger framework. `Time` converts local date/block definitions to UTC before storage. Overlap uses `startA < endB && endA > startB`, so adjacent blocks are allowed.

Roster creation builds exactly 20 stable slots once. Draft mutations require the current roster version. Publication validates coverage and all assignments. Published structures cannot be rewritten directly. Swap submission and acceptance leave owners untouched. Final approval validates both incoming staff against a hypothetical roster excluding the two old assignments, verifies captured owners/versions, exchanges staff IDs, increments versions, and appends the audit/notices in one transaction. A repeated approval returns its saved result. Operation IDs bind request creation to actor and normalized payload; exact retries return the original request.

Availability edits carry a mandatory version for the current staff member and week. The version comparison, save, version increment and any resulting request invalidation share one transaction. Older snapshots project missing version entries as zero without a write on read. Partial-cell submissions follow the same concurrency rule as whole-week forms.

## Persistence and errors

The business snapshot is private `storage/state.json`. All reads share-lock a stable sibling `state.lock`; all writes hold its exclusive lock across load, validation, mutation and save. Acquisition is bounded. Validation rejects missing/malformed or inconsistent records, including published snapshots missing any weekday slot or required people/technicians. Draft gaps remain permitted. Save encodes a complete snapshot, writes a same-directory temporary file, verifies write/flush/close and replaces the destination. Failed replacement preserves the old destination. The protected `replaceSnapshot` method permits a test subclass to simulate a real replacement failure after temporary bytes are written; it is never configured by HTTP input.

This is a cooperative single-server design for a persistent local filesystem. The filesystem and deployment must support replacement semantics; no claim of distributed safety or database-level crash durability is made. Backups/restore are explicit CLI tasks. Separate login-throttle data prevents failed authentication from changing roster history.

## Interface and build

Vite builds JSX to `public/build/` and produces `.vite/manifest.json`. `public/app.php` reads that manifest; Vite never empties the directory containing PHP entry points. The custom entry/manifest configuration follows the [installed Vite 7 backend integration guide](https://v7.vite.dev/guide/backend-integration). `HashRouter` makes direct route refresh independent of rewrite rules. Relative build assets and the central `url()` helper support a configured base path.

React owns only its root. External vanilla code owns only the PHP pages. API failures distinguish expired authentication, stale records, invalid inputs and unavailable storage. Background reads use a special header so polling does not extend idle sessions. Read projections derive expired swaps without saving; later relevant mutations persist expiry/invalidation and notices once.

The draft editor owns an editing snapshot containing both requirements and their roster version. Unsaved inputs retain that version across background updates and show a reload notice; HTTP 409 keeps the form intact. Explicit reload or a successful mutation establishes a new baseline. In-flight editing controls are disabled so a save response cannot replace newer unsaved keystrokes.

Active report and swap-preview readers register with the workspace refresh action. Reports retain their filters while refreshing. `useApi` treats business-revision invalidation as background work, preserves foreground navigation/filter/retry behavior, cancels superseded reads, and uses a request sequence to reject older responses. A pending revision observed during a foreground read triggers at most one necessary background revalidation after that read completes. Automatic bootstrap polling skips an already active bootstrap request.

## Security boundaries

Password hashes stay server-side. Safe projections expose only the current user's email, own availability and relevant private exchange notes. Staff see only published rosters. Supervisor planning may read operational availability. Sessions regenerate after login, use strict cookie-only behavior, HttpOnly/SameSite, and HTTPS Secure cookies. All mutations require CSRF. Token refresh retries only a specifically rejected CSRF request known not to have mutated; ambiguous network failures are not replayed automatically. JSX and PHP escape output; the availability enhancement uses DOM text properties.

The application has two permission roles, staff and supervisor. Technician is a qualification, not an elevated role. The supervisor is never assigned a lab duty.

New password hashes use the shared explicit bcrypt policy in `Passwords`; validation counts bytes and rejects oversized inputs before hashing or verification. Existing hashes remain unchanged. An explicit CLI reset increments an account credential version and invalidates its prior authenticated sessions on their next request. Migration and incident steps are in MIGRATION.md. Release archives are built from an allowlist rather than from all workspace files; operational storage and installed build tools are excluded.
