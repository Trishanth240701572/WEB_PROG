<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/src/bootstrap.php';

function cli_run(callable $task): void
{
    try { $task(); }
    catch (Throwable $error) { fwrite(STDERR, 'Error: ' . $error->getMessage() . PHP_EOL); exit(1); }
}

function cli_options(array $allowed): array
{
    global $argv;
    $result = [];
    for ($i = 1; $i < count($argv); $i++) {
        if (!str_starts_with($argv[$i], '--')) throw new InvalidArgumentException('Use named --options.');
        $pair = explode('=', substr($argv[$i], 2), 2);
        $key = $pair[0];
        if (!array_key_exists($key, $allowed)) throw new InvalidArgumentException('Unknown option --' . $key);
        if (isset($result[$key])) throw new InvalidArgumentException('Duplicate option --' . $key);
        if (!$allowed[$key]) { if (count($pair) !== 1) throw new InvalidArgumentException('--' . $key . ' is a flag.'); $result[$key] = true; continue; }
        $value = $pair[1] ?? ($argv[++$i] ?? null);
        if ($value === null || str_starts_with($value, '--')) throw new InvalidArgumentException('--' . $key . ' needs a value.');
        $result[$key] = $value;
    }
    return $result;
}

function cli_password(): string { return 'Ss!' . bin2hex(random_bytes(12)); }

/** Exclusive creation prevents accidentally replacing a private setup receipt. */
function cli_private_write(string $path, string $content): void
{
    $handle = @fopen($path, 'xb');
    if (!$handle) throw new RuntimeException('Cannot create private output; choose a new path: ' . $path);
    try {
        @chmod($path, 0600);
        $offset = 0;
        while ($offset < strlen($content)) {
            $written = fwrite($handle, substr($content, $offset));
            if ($written === false || $written === 0) throw new RuntimeException('Private output write failed.');
            $offset += $written;
        }
        if (!fflush($handle)) throw new RuntimeException('Private output flush failed.');
    } finally { fclose($handle); }
}
