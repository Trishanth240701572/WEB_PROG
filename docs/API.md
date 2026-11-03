# API contract

All paths are relative to the configured base path. JSON reads/writes use `public/api/index.php?action=...`. Authentication is a PHP session cookie. Responses set `Cache-Control: no-store`. `Input::query()` rejects array-shaped query values and values exceeding 128 bytes with an `invalid_query` response. POST JSON must be an object within 32 KB and include `X-CSRF-Token`; GET never mutates business state. `X-Background-Refresh: 1` prevents background polling from renewing inactivity expiry.

Success: `{ "ok": true, "data": ..., "meta": { "revision": 1, "serverTime": "...Z" } }`. Error: `{ "ok": false, "error": { "code": "...", "message": "...", "fields": {} }, "meta": { "serverTime": "...Z" } }`.

## Reads

| Action | Query | Access / result |
| --- | --- | --- |
| `session` | — | Current safe user and CSRF token |
| `bootstrap` | — | Role-filtered roster, users, own/relevant swaps and notices; supervisor operational availability |
| `availability` | week | Staff's own canonical week values and optimistic `version`; no coworker availability |
| `candidates` | assignmentId | Staff owner's eligible and limited blocked exchange candidates, with explanations and preview |
| `assignment-candidates` | slotId | Supervisor staff picker with assignment reasons |
| `preview` | id | Participants/supervisor before-after evaluation; current final eligibility is always recomputed on approval |
| `report` | week, lab=all/lab-a/lab-b, status=all/state, staffId=all/id | Published week/lab scope; state/involved-staff filters affect history only |

## Mutations

`version` is always an integer. Current actors are resolved from server state, never request-provided roles.

| Action | Payload fields | Actor |
| --- | --- | --- |
| `availability.save` | week, version, values keyed by date and block | Staff; only own values; optional foreign staffId is rejected |
| `roster.create` | week | Supervisor; creates one draft's 20 blocks |
| `roster.assign` | rosterId, version, slotId, staffId | Supervisor; draft only |
| `roster.remove` | rosterId, version, assignmentId | Supervisor; draft only |
| `roster.requirements` | rosterId, version, slotId, headcount, technicianMinimum | Supervisor; draft only |
| `roster.publish` | rosterId, version | Supervisor; complete future draft only |
| `swap.create` | assignmentId, targetAssignmentId, operationId, note (optional) | Owner of first assignment |
| `swap.accept` / `swap.decline` | id, version | Addressed colleague |
| `swap.withdraw` | id, version | Requester of an active request |
| `swap.approve` | id, version | Supervisor after colleague acceptance |
| `swap.reject` | id, version, reason (3–500 bytes) | Supervisor after colleague acceptance |
| `notification.read` | id, or all=true | Only own notices |
| `logout` | empty object | Authenticated actor |

Creation operation IDs use 16–100 letters/digits/underscores/hyphens. IDs are actor-bound and bound to assignment IDs and trimmed note. Reuse with different details conflicts. Server-controlled status, timestamps, audit actors, coverage and qualifications are never assigned from payloads.

Availability reads return `{week, version, values}`. Save returns `{week, version, values, saved}` with the new version. The token belongs to one staff member and Monday week; send the version read with the edited values. Missing or non-integer versions fail validation (`version_required` for a missing token); an older version returns 409 `stale_version` without changing availability, audit, notices or related swaps. This also rejects stale partial-cell writes. Existing snapshots without version metadata read as version 0; an accepted save initializes and advances the token atomically. Staff bootstrap includes only their own week-to-version map; supervisors receive the operational nested map.

Expected statuses: 401 expired/missing authentication; 403 role/ownership/CSRF; 409 stale version/conflict; 422 invalid values; 429 login throttling; 503 unavailable/malformed/busy/write-failed storage. An active request that expired or lost eligibility may return its committed terminal state and message with no assignment changes. Clients must inspect the returned state.

## Ordinary PHP forms and CSV

Login/logout/availability forms POST to `handlers/login.php`, `handlers/logout.php`, and `handlers/availability.php`, with CSRF hidden fields. Availability requires a hidden snapshot `version`, a week and date/block values; the server allows only canonical fields and current staff ownership. A stale form returns HTTP 409 with the submitted choices retained and an explicit reload link. Reloading intentionally discards that unsaved form and starts from the saved week.

`reports/export.php?type=workload|coverage|swaps&week=YYYY-MM-DD&lab=all|lab-a|lab-b` downloads scoped CSV. `status` and `staffId` also filter history, with exactly the same validation as JSON. Staff can export their own workload or own involved history and cannot filter another person's history; coverage requires supervisor. Swap history week means the duty roster week, not the week the request was submitted. Private notes, credentials and hashes are excluded.

CSV uses `fputcsv` with explicit delimiter, quotes, no escape character and CRLF rows. `Csv::safe()` prefixes an apostrophe to formula-like user text beginning with `=`, `+`, `-`, `@`, tabs/newlines/returns, including after leading ASCII whitespace/control characters. Tests round-trip commas, quotes and multiline values. Scheduled numeric fields remain normal numeric text. The same published week/lab data feeds reports, Canvas, HTML tables and exports.
