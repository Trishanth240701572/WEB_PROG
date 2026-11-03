# User-requested live shift-swap verification

Executed on **20 October 2026, 15:53–15:54 Asia/Kolkata**, against the existing application at `http://127.0.0.1:8000/`. This was explicitly requested by the user. It used the real demo store, normal authenticated browser forms, and three separate cookie sessions. It did not reset or reseed any records. The approved exchange remains saved.

Request: **swap-00006**. Roster week: **26–30 October 2026**.

| Stable assignment | Duty (Asia/Kolkata) | Before | After approval |
| --- | --- | --- | --- |
| assignment-00013 | Lab A, Tuesday 27 October, 13:00–16:00 | Ananya Krishnamurthy, version 1 | Divya Nair, version 2 |
| assignment-00017 | Lab A, Wednesday 28 October, 09:00–12:00 | Divya Nair, version 1 | Ananya Krishnamurthy, version 2 |

**Result: 9 browser verification groups passed, 0 failed.**

An independent, read-only `Store::read()` verification also passed **11 of 11 checks** against the private pre-workflow backup. It confirmed the two saved owners/versions, request and roster versions, unchanged other assignments/slot definitions, correct timeline actors, saved supervisor decision, exactly-once audit/notices, and unchanged valid coverage/workload totals.

- Authenticated separately as Ananya, Divya and the supervisor without changing the user's existing browser login.
- Confirmed the exact two duties were available for a new exchange and every current eligibility check passed.
- Ananya submitted a fresh request through **Swap centre → Request exchange → Send exchange request**. State became `awaiting_colleague`, request version 1. Every assignment remained unchanged.
- Divya opened the new request from **Incoming** and clicked **Accept exchange**. State became `awaiting_supervisor`, request version 2. Every assignment and the roster version still remained unchanged.
- The supervisor opened the request from **Approval inbox**, reviewed current checks, and clicked **Approve exchange**. State became `approved`, request version 3.
- Both assignment owners exchanged together and both assignment versions increased exactly once. Slot IDs, dates, UTC timestamps, labs, requirements and every other assignment remained unchanged. The roster version increased from 2 to 3; snapshot revision increased from 1 to 4 across the three mutations.
- Reloaded the approved request and confirmed the saved three-stage timeline, supervisor decision and one before/after exchange audit. Approval was no longer offered.
- Reloaded both staff rosters and verified the new duties appeared in the correct staff rows and the old duties were absent from those rows.
- Confirmed exactly one approval notification for each participant, unchanged scheduled hours (Ananya 12, Divya 9), unchanged report totals and complete person/technician coverage. No browser page or console errors were observed.

The first automation attempt checked the candidate list before its asynchronous load completed; no request was submitted in that attempt. The harness was corrected to wait for the exact candidate card. The successful run above created and approved only one new request.

Evidence: [sanitized result records](LIVE_SWAP_RESULTS.json), [request awaiting colleague](live-swap/swap-00006-01-awaiting-colleague.png), [colleague acceptance](live-swap/swap-00006-02-awaiting-supervisor.png), [supervisor preview](live-swap/swap-00006-03-before-approval.png), [saved approval](live-swap/swap-00006-04-approved.png), and [roster after reload](live-swap/swap-00006-05-roster-after-reload.png).

A private backup was created before this deliberate live mutation at `storage/backup-20261020-155114-201757.json`. It includes private records and password hashes and must remain outside the web root. It was not restored: the user-requested approved outcome remains in the current demo. The previously suggested Ananya/Divya duties have therefore already been exchanged; choose another eligible pair for a future fresh request.
