<?php
declare(strict_types=1);
require __DIR__ . '/cli.php';
$failed = false;
$check = function (bool $ok, string $message) use (&$failed): void { echo ($ok ? 'PASS ' : 'FAIL ') . $message . PHP_EOL; if (!$ok) $failed = true; };
$check(version_compare(PHP_VERSION, '8.3.0', '>='), 'PHP 8.3+ (running ' . PHP_VERSION . ')');
foreach (['json', 'session', 'date', 'filter'] as $extension) $check(extension_loaded($extension), 'PHP extension: ' . $extension);
foreach (['password_hash', 'random_bytes', 'flock', 'fsync'] as $fn) $check(function_exists($fn), 'Function: ' . $fn);
$check(is_dir(dirname(config('store_path'))) && is_writable(dirname(config('store_path'))), 'Private storage directory writable');
$check(!str_starts_with(str_replace('\\', '/', config('store_path')), str_replace('\\', '/', SHIFTSYNC_ROOT . '/public/')), 'Storage is outside public/');
$check(is_file(SHIFTSYNC_ROOT . '/public/build/.vite/manifest.json'), 'Built React manifest (run npm build first)');
$check(is_file(SHIFTSYNC_ROOT . '/public/assets/vendor/bootstrap.min.css'), 'Local Bootstrap CSS');
$check(is_file(SHIFTSYNC_ROOT . '/public/assets/vendor/bootstrap.bundle.min.js'), 'Local Bootstrap JavaScript');
if (is_file(config('store_path'))) { try { store()->read(); $check(true, 'Existing state integrity'); } catch (Throwable $error) { $check(false, $error->getMessage()); } }
else echo "INFO No state yet; run explicit setup after building.\n";
echo "Institution timezone: " . config('timezone') . "\n";
echo "Production needs one PHP server, HTTPS, and private persistent local storage.\n";
exit($failed ? 1 : 0);
