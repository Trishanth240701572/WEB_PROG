<?php
declare(strict_types=1);
require __DIR__ . '/cli.php';
cli_run(function (): void {
    $options = cli_options(['name' => true, 'email' => true, 'role' => true, 'qualification' => true, 'password-stdin' => false, 'initialize-empty' => false]);
    $name = trim($options['name'] ?? '');
    $email = strtolower(trim($options['email'] ?? ''));
    $role = $options['role'] ?? 'staff';
    $qualification = $options['qualification'] ?? 'assistant';
    if ($name === '' || strlen($name) > 120) throw new InvalidArgumentException('A name of 1-120 bytes is required.');
    if (strlen($email) > 180 || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('A valid email is required.');
    if (!in_array($role, ['staff', 'supervisor'], true) || !in_array($qualification, ['technician', 'assistant'], true)) throw new InvalidArgumentException('Invalid role or qualification.');
    $password = isset($options['password-stdin']) ? rtrim((string)fgets(STDIN), "\r\n") : cli_password();
    Passwords::validateForCreation($password);
    $create = function (array &$state) use ($name, $email, $role, $qualification, $password): string {
        foreach ($state['users'] as $user) if (strtolower($user['email']) === $email) throw new RuntimeException('That account already exists.');
        $id = 'u-' . bin2hex(random_bytes(8));
        $state['users'][$id] = ['id' => $id, 'name' => $name, 'email' => $email, 'role' => $role, 'qualification' => $qualification, 'active' => true, 'passwordHash' => Passwords::hash($password), 'credentialVersion' => 1];
        return $id;
    };
    if (isset($options['initialize-empty'])) {
        if ($role !== 'supervisor') throw new InvalidArgumentException('Initialize an empty production store with a supervisor account first.');
        $state = ['schemaVersion' => 1, 'revision' => 1, 'counters' => [], 'users' => [], 'availability' => [], 'rosters' => [], 'slots' => [], 'assignments' => [], 'swaps' => [], 'notifications' => [], 'audit' => [], 'operations' => []];
        $id = $create($state);
        if (!is_dir(dirname(config('store_path')))) mkdir(dirname(config('store_path')), 0700, true);
        store()->init($state); // Refuses an existing store, even when --initialize-empty is repeated.
    } else $id = store()->transaction($create);
    echo "Created $role account $id ($email).\n";
    if (!isset($options['password-stdin'])) echo 'Generated password (shown once): ' . $password . "\n";
});
