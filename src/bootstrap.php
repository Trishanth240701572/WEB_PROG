<?php
declare(strict_types=1);

define('SHIFTSYNC_ROOT', dirname(__DIR__));
$config = require SHIFTSYNC_ROOT . '/config/app.php';
spl_autoload_register(static function (string $class): void {
    if (preg_match('/^[A-Za-z][A-Za-z0-9]*$/', $class) && is_file(__DIR__ . '/' . $class . '.php')) {
        require_once __DIR__ . '/' . $class . '.php';
    }
});
date_default_timezone_set($config['timezone']);
Time::configure($config['timezone']);

function config(?string $key = null): mixed { global $config; return $key === null ? $config : $config[$key]; }
function store(): Store { static $store; return $store ??= new Store(config('store_path')); }
function url(string $path = ''): string { return config('base_path') . '/' . ltrim($path, '/'); }
function e(mixed $value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function redirect(string $path): never { header('Location: ' . url($path), true, 303); exit; }
function security_headers(): void {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    header('Cache-Control: no-store');
}
if (PHP_SAPI !== 'cli') {
    security_headers();
    set_exception_handler(static function (Throwable $error): void {
        $known = $error instanceof DomainError;
        http_response_code($known ? $error->status : 500);
        if (!$known) error_log('ShiftSync page: ' . $error->getMessage());
        Page::head('Unable to open this page');
        echo '<main id="main" class="container public-main"><div class="panel panel-body"><h1>Unable to open this page</h1><p>' . e($known ? $error->getMessage() : 'Something went wrong. Please try again.') . '</p><a class="btn btn-secondary" href="' . e(url('login.php')) . '">Return to sign in</a></div></main>';
        Page::foot();
    });
}
