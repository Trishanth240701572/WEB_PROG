<?php
declare(strict_types=1);

final class Page
{
    public static function head(string $title): void
    {
        ?><!doctype html><html lang="en" class="no-js" data-bs-theme="dark"><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#0B0D13"><title><?= e($title) ?> · ShiftSync</title>
        <link rel="icon" type="image/svg+xml" href="<?= e(url('assets/mark.svg')) ?>">
        <link rel="stylesheet" href="<?= e(url('assets/vendor/bootstrap.min.css')) ?>">
        <link rel="stylesheet" href="<?= e(url('assets/css/app.css')) ?>">
        <link rel="stylesheet" href="<?= e(url('assets/css/php.css')) ?>">
        </head><body><a class="skip-link" href="#main">Skip to content</a><?php
    }

    public static function brand(): void
    {
        ?><a class="brand" href="<?= e(url()) ?>"><img class="brand-mark" src="<?= e(url('assets/mark.svg')) ?>" alt="" width="32" height="32"><span>ShiftSync</span></a><?php
    }

    public static function sidebar(array $user): void
    {
        ?><aside class="sidebar php-sidebar"><?php self::brand(); ?><span class="sidebar-label">WORKSPACE</span>
        <nav class="sidebar-nav" aria-label="Main navigation">
        <a class="nav-item" href="<?= e(url('app.php#/overview')) ?>">Overview</a>
        <a class="nav-item" href="<?= e(url('app.php#/roster')) ?>">Weekly roster</a>
        <a class="nav-item active" href="<?= e(url('availability.php')) ?>" aria-current="page">My availability</a>
        <a class="nav-item" href="<?= e(url('app.php#/my-shifts')) ?>">My shifts</a>
        <a class="nav-item" href="<?= e(url('app.php#/swaps')) ?>">Swap centre</a>
        <a class="nav-item" href="<?= e(url('app.php#/summary')) ?>">My summary</a>
        <a class="nav-item" href="<?= e(url('app.php#/notifications')) ?>">Notifications</a>
        </nav><div class="sidebar-bottom"><span class="pill">Fictional college demo</span><div class="user-chip"><span class="avatar"><?= e(self::initials($user['name'])) ?></span><span><?= e($user['name']) ?><small>Staff account</small></span></div>
        <form method="post" action="<?= e(url('handlers/logout.php')) ?>"><input type="hidden" name="csrf" value="<?= e(Csrf::token()) ?>"><button class="btn btn-quiet" type="submit">Sign out</button></form></div></aside><?php
    }

    public static function initials(string $name): string
    {
        $words = preg_split('/\s+/', trim($name));
        return strtoupper(substr($words[0], 0, 1) . substr(end($words), 0, 1));
    }

    public static function foot(): void { echo '</body></html>'; }
}
