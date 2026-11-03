# Viva guide

**What is the application?** ShiftSync records availability, helps a supervisor build valid lab coverage, and permits approved two-way exchanges. It schedules hours rather than measuring attendance.

**Why use PHP and React together?** PHP validates, authenticates and persists records. React handles the interactive protected workspace. PHP-rendered availability demonstrates ordinary forms and progressive enhancement. A single origin makes cookies and API calls straightforward.

**Where is the data stored?** `storage/state.json`, outside the web document root. `Store` protects it with a stable sibling lock. A write holds an exclusive lock for the entire validation/update/save operation. Reads take a shared lock. Failed or malformed state never silently becomes demo data.

**Why isn't availability a boolean?** A missing submission is different from explicit availability. Only `available` qualifies for assignment; `unavailable` and `not_submitted` both block it. Past blocks cannot change, and a current assignment protects its cell even in a draft.

**Does technician mean supervisor?** No. Role grants application permission; qualification determines staffing coverage. Technicians are staff and count once toward people and toward the technician subset. The supervisor never holds a duty.

**How do overlaps work?** Two intervals overlap when `startA < endB && endA > startB`. An end equal to another start is allowed. Checks include all retained draft/published assignments across both labs.

**Can two assistants fill a two-person slot?** They meet headcount but fail a minimum of one technician. `Domain::coverage` reports missing people and missing technicians separately. Publishing validates both.

**What happens during approval?** The service checks supervisor/current request version, acceptance, future published blocks, captured owners/assignment versions, both staff's availability/conflicts, and both slots' post-exchange technician coverage. It exchanges only the two `staffId` values, increments versions, and saves status, audit and notices together under one lock.

**Why don't request/accept buttons change the roster?** Consent is not approval. Only final supervisor approval commits the exchange. Before and after previews are advisory until that final validation.

**What if Approve is clicked twice?** An already approved request returns its saved result. The assignment owners are not exchanged back and side effects are not duplicated. Creation uses an actor/payload-bound operation ID for the same reason.

**Can two PHP workers approve together?** They cooperate through the same exclusive business lock. The second observes the committed approved record and returns it. `tests/run.php` launches separate processes to verify this, instead of relying on the single-threaded development server.

**How are stale forms handled?** Drafts and swaps carry versions. A mutation must match the current version; otherwise the server returns a conflict and the interface refreshes before retry. An older frontend response is also ignored through hook cleanup/request sequencing.

**What if a request expires while open?** Server time decides at the earlier start. Read DTOs show an expired status without rewriting storage; the next relevant mutation persists expiry and notices. A green earlier preview never authorizes a later invalid approval.

**What is React state versus props here?** The selected week/filter/selection are local state. A `DutyBlock` receives its slot via props; `RosterGrid` receives the current assignments/users. Server projections remain authoritative. `NextShiftCountdown` is the useful class example, with timer lifecycle cleanup and explicit prop validation.

**Why HashRouter?** `app.php#/roster` refreshes against `app.php`, so Apache needs no application route rewrite. The URL helper prefixes the real PHP/API paths for subdirectory installation.

**How is security enforced?** PHP checks sessions, actor role/ownership, CSRF and allowed fields. Hiding buttons is only presentation. Password hashes and coworkers' emails/private availability are removed from staff DTOs. Text is escaped. Session locks close before longer business operations. Background polling does not extend the idle deadline.

**How are charts accessible and exports consistent?** `Domain::report` creates one week/lab scope. Canvas and HTML workload table consume the same rows; CSV uses the same report. Formula-like text receives an apostrophe prefix and `fputcsv` quotes fields. Swaps preserve filled places and usually equal-duration hours.

**What are the limits?** Cooperative file storage on one persistent local server; no distributed writes or database-grade durability claim. No automatic optimization, attendance, payroll, overnight shifts, one-way transfers or emergency republishing. A future database migration can improve scale without moving business validation into the browser.
