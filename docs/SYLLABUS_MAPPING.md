# Syllabus mapping

The references below point to implemented examples, not disconnected exercises. Supporting security and consistency features are listed separately from the basic syllabus topics.

| Topic | Real implementation and explanation |
| --- | --- |
| HTML5 | `public/index.php`, `login.php`, `availability.php` use headings, navigation, main landmarks, labelled forms, fieldsets, input/select controls and semantic tables. React `DataTable` supplies captions/header cells. The wordmark and line icons are meaningful local interface assets; no decorative photo is needed. |
| CSS selectors/cascade | `public/assets/css/tokens.css` defines design variables imported by `app.css`. The external `app.css` and `php.css` follow Bootstrap and hold base/component rules, colors, fonts, borders, spacing, focus, motion and print media queries. |
| Box model/responsiveness | External CSS uses grid/flex layouts, padding/gaps, fixed scales and media queries. `RosterGrid` becomes `AgendaList` for narrow screens rather than shrinking a full weekly grid. |
| JavaScript fundamentals | `public/assets/js/availability.js` demonstrates variables, arrays, functions, loops, events, confirmation, form validation and DOM updates. `updateAvailability()` counts chosen blocks and tracks dirty state; `fillFields()` fills day/week cells. Text uses `textContent`. |
| Canvas | `CanvasWorkloadChart` in `frontend/src/pages/Reports.jsx` draws scheduled hours from report rows and responds to size changes. The adjacent HTML table exposes equivalent values. |
| PHP language | `src/Time.php` and `Domain.php` demonstrate arrays, strings, conditions, loops, functions and class constants. `src/bootstrap.php` uses includes/autoloading and shared helpers. PHP pages generate escaped HTML; handlers process POST forms. |
| File handling | `src/Store.php` demonstrates private JSON reads/writes, `fopen`, `flock`, bounded retries, temporary files, flush and replacement. `scripts/backup.php` and `restore.php` are explicit maintenance operations. |
| Bootstrap | Local vendor CSS supports container/grid/form/button/table and flex utility behavior. `public/availability.php` uses a PHP-owned Collapse help panel; the no-JavaScript CSS keeps its text readable. React-controlled elements do not use imperative Bootstrap plugins. |
| JSX/components/props | `frontend/src/App.jsx` routes composed pages. `AppLayout`, `RosterGrid`, `DutyBlock`, `CoverageBadge`, `Drawer`, `SwapComparison`, `EligibilityChecklist`, `RequestTimeline` and `DataTable` demonstrate reusable components and data through props. |
| React state/hooks | `frontend/src/App.jsx` owns authoritative-server projections and selected week; `context.jsx` defines the context and hook that share them. `useApi` uses effects, cleanup, abort and request sequencing; pages hold local filters/forms. `useRef` handles focus/canvas/operation identity. |
| Explicit prop validation | `validateCountdownProps()` in `components/UI.jsx` is called by the countdown. It does not rely on legacy automatic `.propTypes` behavior. |
| Class/lifecycle | `NextShiftCountdown` uses constructor, `render`, `setState`, `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` to manage a timer that updates on a changed target and cleans up. Most components are functions. |
| React Router | `frontend/src/main.jsx` creates HashRouter; `App.jsx` defines its routes. PHP links navigate to the integrated availability page. Refreshing a hash route needs no server rewrite. |
| Build/hosting | `frontend/vite.config.js` compiles to `public/build/` with manifest. `public/app.php` loads compiled assets. PHP serves pages, API and assets from one origin. `config/app.php` plus `url()` handles installation prefixes. |

React Developer Tools was not installed or exercised during the recorded automated verification. If available in a development browser, select `RosterPage` to inspect selected slot state, `RosterGrid` to inspect assignments/users props, and `ReportsPage` to inspect week/lab/status filters. Change the week and observe the data effect cleanup; do not edit server records through developer tools.

Supporting additions: Fetch/JSON is the browser/server transport; sessions authenticate; CSRF guards mutations; shared/exclusive locks serialize storage; optimistic versions reject stale forms; creation operation IDs and saved approval results make exact retries safe; UTC timestamps plus institution-local keys prevent browser timezone drift. These support correctness but are distinct from the core HTML/CSS/JS/PHP/React syllabus.

This system schedules duties for one host and one fictional institution. It does not verify worked hours, implement payroll, track people, or claim enterprise/distributed scale.
