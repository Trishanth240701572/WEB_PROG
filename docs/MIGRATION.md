# Updating an existing installation

Keep the existing private state, backups and local configuration in place. This patch does not reset, seed, rewrite or delete operational data. Deploy the updated PHP files and compiled frontend assets together during a maintenance window, then have users reload open forms and application tabs. A form or API client from the old release lacks the new availability token and must reload before saving.

## Availability concurrency

Schema version 1 remains readable. `availabilityVersions[staffId][Monday]` is optional in older snapshots and projects as 0 without writing during a read. The first accepted versioned save initializes/increments that staff/week token under the existing transaction. No bulk migration command is required. Subsequent stale saves return HTTP 409, including partial saves affecting the same or different cells in that week. API integrations must fetch `action=availability&week=YYYY-MM-DD` and submit its version with their edited values.

The PHP conflict page preserves the submitted choices and older version. Review them before using its explicit reload link, which starts a new form from the current saved week. The roster editor similarly preserves unsaved input when background data changes; reload intentionally establishes a new baseline.

## Password policy and older hashes

Provisioning, demo creation and password reset now use explicit `PASSWORD_BCRYPT` at cost 12. New or reset passwords must be 12–72 bytes and contain no NUL byte. UTF-8 characters can occupy multiple bytes. Authentication retains support for existing passwords shorter than the new creation minimum and does not rewrite existing hashes merely on sign-in. [PHP documents bcrypt's 72-byte limit](https://www.php.net/manual/en/function.password-hash.php) and [verification using the stored hash](https://www.php.net/manual/en/function.password-verify.php).

An old bcrypt hash cannot reveal whether its original input exceeded 72 bytes and cannot verify any previously discarded suffix. Rehashing the old hash or truncating a submitted password does not recover that suffix. This release rejects sign-in inputs longer than 72 bytes with reset guidance. If an account used an oversized password, verify its owner through your normal administrative process and deliberately set a fresh password within the supported limit. Do not instruct users to authenticate with a truncated prefix.

Use the CLI with a protected standard-input source, never a password in command arguments or a shared terminal transcript:

```sh
php scripts/reset-password.php --email person@example.edu --password-stdin
```

The reset command updates only the selected existing account, increments its credential version transactionally, and causes its old authenticated sessions to fail on their next request. Old snapshots/users/sessions without that field use version 0 for compatibility. Existing hashes and sessions are not silently migrated during deployment. No password resets were performed while implementing this patch.

## If a previous archive included credentials or sessions

Treat credentials, state hashes, local secrets and session files in that archive as disclosed to anyone who received it. Replacing the ZIP alone does not invalidate those credentials or sessions.

1. Stop affected deployment traffic and preserve a private backup for recovery.
2. Verify account ownership and rotate every included account password with the reset command. Rotate any unrelated service secrets copied in local configuration as well.
3. Invalidate all imported or disclosed sessions. In addition to per-account credential-version invalidation, configure `session_path` in private `config/local.php` to a new, empty, private directory and restart the PHP workers. Keep the former session directory outside the new runtime path; do not copy its contents back. This forces fresh sign-ins without deleting historical operational files.
4. Deploy from the sanitized release archive, retaining only the intended existing private business store and reviewed local configuration. Never import session files or a demo credential receipt from a release ZIP. Reload clients after deployment.

For a new installation, the release intentionally contains no operational state or working login credentials. Explicitly provision a production supervisor, or explicitly seed fictional data for a local demonstration, using the README commands. Build future archives with the release script described in RELEASE.md rather than compressing the workspace manually.
