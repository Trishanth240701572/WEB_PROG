<?php
declare(strict_types=1);

// PHP's development server otherwise falls back to index.php for unknown paths.
// Keep the preview confined to actual public files and return honest 404 responses.
$publicRoot = realpath(dirname(__DIR__) . '/public');
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$requestPath = is_string($requestPath) ? rawurldecode($requestPath) : '';

if ($requestPath === '/') {
    require $publicRoot . '/index.php';
    return true;
}

$resolved = null;
if ($requestPath !== '' && !str_contains($requestPath, "\0") && !str_contains($requestPath, '\\')) {
    $resolved = realpath($publicRoot . $requestPath);
}
$prefix = $publicRoot . DIRECTORY_SEPARATOR;
if ($resolved && strncasecmp($resolved, $prefix, strlen($prefix)) === 0 && is_file($resolved)) {
    if (strtolower(pathinfo($resolved, PATHINFO_EXTENSION)) === 'php') {
        require $resolved;
        return true;
    }
    return false; // The PHP server supplies the correct content type for static assets.
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo "Not found.\n";
return true;
