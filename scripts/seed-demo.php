<?php
declare(strict_types=1);
require __DIR__ . '/cli.php';
cli_run(function (): void {
    $options = cli_options(['week-start' => true, 'reset' => false]);
    // The default is the next complete future Monday-Friday week; dates stay fixed after setup.
    $week = Time::week($options['week-start'] ?? null);
    if (!Time::future(Time::slotTimes($week, 'morning')[0])) throw new InvalidArgumentException('Demo week must be a future Monday.');
    $path = config('store_path');
    if (!is_dir(dirname($path)) && !mkdir(dirname($path), 0700, true)) throw new RuntimeException('Cannot create private storage.');
    if (is_file($path) && !isset($options['reset'])) throw new RuntimeException('Store exists. Seeding refused. Only --reset deliberately replaces all existing records.');
    $passwords = [];
    foreach (Demo::emails() as $email) $passwords[$email] = cli_password();
    $state = Demo::state($passwords, $week);
    $receipt = dirname($path) . '/demo-credentials' . (isset($options['reset']) ? '-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) : '') . '.txt';
    cli_private_write($receipt, "FICTIONAL LOCAL DEMO ACCOUNTS — DO NOT DEPLOY THESE ACCOUNTS\nGenerated " . Time::iso() . "\nWeek " . $week . "\n\n" . implode("\n", array_map(fn($email, $password) => $email . "\t" . $password, array_keys($passwords), $passwords)) . "\n");
    try { (new Store($path))->init($state, isset($options['reset'])); }
    catch (Throwable $error) { @unlink($receipt); throw $error; }
    echo "Fictional demo seeded for $week. Private one-time setup receipt: $receipt\n";
    echo "Passwords are not printed to the terminal. Keep the receipt private.\n";
});
