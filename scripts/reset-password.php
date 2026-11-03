<?php
declare(strict_types=1);
require __DIR__ . '/cli.php';

cli_run(function (): void {
    $options = cli_options(['email' => true, 'password-stdin' => false]);
    $email = strtolower(trim($options['email'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Provide the account email with --email.');
    $password = isset($options['password-stdin']) ? rtrim((string)fgets(STDIN), "\r\n") : cli_password();
    $hash = Passwords::hash($password);
    store()->transaction(function (array &$state) use ($email, $hash): void {
        foreach ($state['users'] as $id => $user) {
            if (strtolower($user['email']) !== $email) continue;
            $state['users'][$id]['passwordHash'] = $hash;
            $state['users'][$id]['credentialVersion'] = ($user['credentialVersion'] ?? 0) + 1;
            $state['users'][$id]['passwordChangedAt'] = Time::iso();
            return;
        }
        throw new RuntimeException('No account matches that email.');
    });
    echo "Password reset. Existing sessions for this account will require sign-in again.\n";
    if (!isset($options['password-stdin'])) echo 'Generated password (shown once): ' . $password . "\n";
});
