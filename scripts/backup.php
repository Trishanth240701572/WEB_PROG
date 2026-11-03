<?php
declare(strict_types=1);
require __DIR__ . '/cli.php';
cli_run(function (): void {
    $options = cli_options(['output' => true]);
    $output = $options['output'] ?? dirname(config('store_path')) . '/backup-' . date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.json';
    // Store::read takes the same stable lock as every business writer.
    $state = store()->read();
    cli_private_write($output, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n");
    echo "Verified snapshot backed up to $output. It contains password hashes and private records; protect it.\n";
});
