# Safe release packaging

Run from the ShiftSync project root after the frontend build and regression checks have passed:

```sh
node tests/package-release.mjs
node scripts/package-release.mjs --out artifacts/ShiftSync-patched.zip
node scripts/package-release.mjs --verify artifacts/ShiftSync-patched.zip
```

Use the Node executable supplied by your installation. In this Windows workspace, if Node is not on PATH:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" tests/package-release.mjs
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts/package-release.mjs --out artifacts/ShiftSync-patched.zip
```

The script needs no ZIP utility or extra npm dependency. It uses an inclusion policy rather than recursively archiving the working folder or relying on Git ignore rules. It never loads PHP configuration, reads the operational store, or changes accounts, sessions, backups or running processes. It refuses to overwrite an existing output; choose a new output name for another release.

## What is included

- Application PHP source; approved configuration defaults and `local.example.php`.
- Frontend source, package metadata, lockfile and Vite configuration.
- Public PHP entries, local assets/vendor license, the Vite manifest and only its referenced build assets, including imported and lazy chunks.
- Source CLI utilities, including account creation and password reset.
- Source regression tests and the deliberately fictional `tests/fixtures/state.php` fixture generator.
- README, project conventions, and selected architecture/API/deployment/syllabus/viva/demo/release/fix/migration guides.
- Fresh, zero-byte `storage/.gitkeep` and `storage/sessions/.gitkeep` placeholders, generated without reading existing storage files.
- A generated `RELEASE-MANIFEST.json` recording each included file's size and SHA-256 digest. It contains no absolute workstation paths or build time.

The `DOC_FILES` policy in `scripts/package-release.mjs` deliberately lists documentation names. Add a new release guide there when needed; arbitrary notes are not included automatically.

## What is excluded

All operational storage is excluded: business snapshots, hashes in those snapshots, backups, plaintext setup receipts, PHP session files, throttle records, process manifests and tunnel/server logs. Private `config/local.php`, environment files, `.tools/`, installed `node_modules/`, previous ZIPs/artifacts, temporary test stores, browser authentication files, source baselines/raw copies, pasted user attachments, screenshots, live-demo outputs and test-result JSON are excluded. Existing operational data remains untouched.

The selected-content scan additionally rejects credential-like hash literals, generated-password values, private keys, secret assignments and serialized session/snapshot material. One documented synthetic Auth dummy hash is allowed only in its authored source file. Pattern scanning is a supplementary check: it cannot prove arbitrary text contains no secret, so the strict path policy remains the primary boundary. Do not add real credentials to source or approved fixture code.

## Reproducibility and validation

ZIP entries are sorted, stored without compression, timestamped consistently and given a fixed regular-file mode. Identical selected file bytes produce identical ZIP bytes regardless of source mtimes or traversal order. There is no current date, random identifier, workstation path or runtime state in the archive metadata. Changing source or build bytes changes the archive digest as expected.

Before and after writing, verification checks local/central ZIP headers, CRC32, manifest SHA-256 values, entry lengths, duplicates/case collisions and the inclusion policy. Absolute paths, parent traversal, Windows-special paths, symlink/junction inputs, symlink archive metadata and nonempty storage placeholders are rejected. Only manifest-referenced build assets are selected; a stale or missing build fails rather than omitting required assets. Current ZIP support is intentionally bounded to stored, single-volume archives up to 256 MB.

The regression suite packages isolated synthetic trees, places sentinel values in forbidden locations, verifies required source/build content and deterministic output, checks that excluded originals remain unchanged, and exercises malformed manifests, unsafe paths, links, corruption and output-overwrite refusal. It never packages the operational workspace as a test.

For a clean installation, extract into a new directory, configure the web server document root as `public/`, set private filesystem permissions, and provision fresh accounts. The release does not carry a preinitialized business store or reusable demonstration credentials. Build tooling is unnecessary for normal requests because compiled assets are included.

## If an earlier ZIP exposed credentials or session state

Treat every affected account and session in that distributed ZIP as compromised. Restrict access to the old archive and stop distributing it. Do not reuse its plaintext setup passwords or restore its PHP session files into another deployment. Review exposure and reset all accounts that appeared in the leaked snapshot, not only the account whose receipt someone noticed.

Use the new password-reset CLI on the affected installation, one account at a time:

```sh
php scripts/reset-password.php --email staff@example.edu --password-stdin
```

Supply a new password through standard input, never a command-line argument or a source file. The shared password policy accepts 12–72 bytes, including the byte length of multibyte text. The reset increments the account's credential version, invalidating all its existing sessions on their next request. Reset every affected account, including supervisors, to invalidate all leaked sessions. No business records need to be deleted to do this. Follow [MIGRATION.md](MIGRATION.md) for preexisting passwords longer than bcrypt's limit and deployment-wide session invalidation; their discarded suffix cannot be recovered by rehashing.

For a new deployment, initialize a fresh store with a newly provisioned supervisor and add fresh staff accounts. Migrate business records only through a separately reviewed, private process; never deploy the old session directory. Packaging itself performs no credential rotation, session invalidation, restore, reset or deletion.
