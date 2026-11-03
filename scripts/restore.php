<?php
declare(strict_types=1);
require __DIR__ . '/cli.php';
cli_run(function (): void {
    $options = cli_options(['input' => true, 'replace-existing' => false]);
    if (!isset($options['input'])) throw new InvalidArgumentException('--input backup.json is required.');
    $json = @file_get_contents($options['input']);
    if ($json === false || strlen($json) > 20 * 1024 * 1024) throw new RuntimeException('Backup is unreadable or exceeds 20 MB.');
    $state = json_decode($json, true, 128, JSON_THROW_ON_ERROR);
    if (!is_array($state)) throw new RuntimeException('Backup must be a JSON object.');
    Store::validate($state);
    if (!is_dir(dirname(config('store_path')))) mkdir(dirname(config('store_path')), 0700, true);
    // init validates and replaces under the normal exclusive lock, without deleting the old file.
    store()->init($state, isset($options['replace-existing']));
    echo "Verified snapshot restored.\n";
});
