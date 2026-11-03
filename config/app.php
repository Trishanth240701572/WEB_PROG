<?php
declare(strict_types=1);

$local = is_file(__DIR__ . '/local.php') ? require __DIR__ . '/local.php' : [];
return array_replace([
    'name' => 'ShiftSync',
    'institution' => 'Northfield College',
    'timezone' => 'Asia/Kolkata',
    'base_path' => rtrim(getenv('SHIFTSYNC_BASE_PATH') ?: '', '/'),
    'store_path' => getenv('SHIFTSYNC_STORE') ?: dirname(__DIR__) . '/storage/state.json',
    'session_path' => getenv('SHIFTSYNC_SESSION_PATH') ?: dirname(__DIR__) . '/storage/sessions',
    'idle_seconds' => 1800,
    'absolute_seconds' => 28800,
], $local, [
    // Force this only for an origin reached through a known HTTPS-only proxy.
    // A per-process environment override must also win over a local false value.
    'secure_cookies' => getenv('SHIFTSYNC_SECURE_COOKIES') === '1' || ($local['secure_cookies'] ?? false) === true,
]);
