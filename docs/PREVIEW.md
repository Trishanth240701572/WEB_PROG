# Shareable Cloudflare preview

Created at the user's request on **21 October 2026**:

**https://circuits-foster-ability-tournament.trycloudflare.com**

The existing PHP sign-in protects the application. Opening the link shows the introduction and sign-in page. The preview uses the existing demo records, including approved request `swap-00006`; no reset, reseeding or account changes occurred.

This is a temporary [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). It requires no Cloudflare account or domain. The computer must remain awake and connected, with PHP and cloudflared running. Stopping the tunnel ends access; a newly created tunnel gets a different hostname. This is not a permanent hosted deployment.

## Start and stop

From the project directory in PowerShell:

```powershell
.\scripts\share-preview.ps1
```

The script reuses a currently running preview and prints its URL. Otherwise it starts a dedicated PHP origin on `127.0.0.1:8001` and a hidden cloudflared process. It runs only from `public/` and never seeds business data. After a reboot, run it again to create a new temporary URL.

To end sharing:

```powershell
.\scripts\share-preview.ps1 -Stop
```

It checks executable paths and command lines before stopping the two recorded preview processes. The ordinary local server on port 8000 is left running. Process metadata and logs live in ignored private `storage/`, not the web root.

The optional portable cloudflared client is in `.tools/cloudflared/`, which is ignored by Git. A clean checkout needs PHP and cloudflared on PATH or at the portable paths used by the script. The installed official binary is version **2026.10.2**; its SHA-256 matched GitHub release metadata: `12c7c887f8aaab779aef1dfa9b60673530a5adb88ecc55dd6df8f56e0b70f199`. [Official downloads](https://developers.cloudflare.com/tunnel/downloads/).

## HTTPS and private paths

The tunnel's dedicated PHP process has `SHIFTSYNC_SECURE_COOKIES=1`. This sets Secure session cookies behind Cloudflare's HTTPS edge without trusting arbitrary forwarded headers. HttpOnly, SameSite=Lax, session expiry and CSRF protection remain enabled. The normal HTTP server does not inherit this setting. A per-process value of `1` takes precedence over a local false value.

`scripts/dev-router.php` returns actual public files and honest 404 responses for missing/private paths. The PHP server otherwise falls back to `index.php` for unknown URLs, which initially produced the public introduction with HTTP 200 on private-looking paths. The router prevents that confusing fallback and rejects resolved paths outside `public/`.

## Executed verification

- **26 external anonymous HTTP checks passed:** introduction, login, local assets/manifest/compiled bundle, authentication redirects, JSON 401 responses and 404 responses for ten checked private paths.
- **Real browser checks passed** on the Cloudflare URL and ordinary localhost URL: introduction/sign-in rendering, local image loading, protected-workspace redirect, HttpOnly/SameSite=Lax cookies, Secure enabled over the tunnel and disabled on ordinary local HTTP. No browser page errors were observed.
- **15 isolated HTTP regression checks passed** after the authentication configuration change; existing local sessions and workflows remain compatible.
- **15 isolated HTTP checks also passed through the new preview router**, using `node tests/e2e/http.mjs --router` with synthetic localhost-only accounts. This covered login/logout, CSRF, availability, roster publication, swap approval, CSV and expiry through the same router used by the shared preview.
- PHP syntax checks passed for the two changed PHP files and new preview router. The preview script's fresh start and reuse paths were exercised successfully.

Evidence: [external HTTP checks](TUNNEL_PUBLIC_CHECKS.json), [browser checks](TUNNEL_BROWSER_CHECKS.json), and [public sign-in screenshot](screenshots/cloudflare-preview-login.png).

Authenticated sign-in through the external tunnel was **not tested**. Automatic approval review rejected submitting stored demo credentials through that public destination; that action was not retried or bypassed. Only anonymous public browser checks and isolated localhost authentication regression tests were executed.
