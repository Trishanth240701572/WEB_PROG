<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';
$user = Auth::pageUser();
$manifestPath = __DIR__ . '/build/.vite/manifest.json';
$manifest = is_file($manifestPath) ? json_decode(file_get_contents($manifestPath), true, 512, JSON_THROW_ON_ERROR) : [];
$entry = null;
foreach ($manifest as $chunk) if ($chunk['isEntry'] ?? false) { $entry = $chunk; break; }
$context = ['basePath' => config('base_path'), 'csrf' => Csrf::token(), 'user' => $user];
Page::head('Workspace');
if (!$entry): ?>
<main id="main" class="public-main container"><div class="panel panel-body"><h1>Build the workspace first</h1><p>The PHP backend is ready. Install frontend dependencies and run the production build in <code>frontend/</code>, then reload.</p><a class="btn btn-secondary" href="<?= e(url('availability.php')) ?>">Open availability</a></div></main>
<?php else:
    foreach ($entry['css'] ?? [] as $css): ?><link rel="stylesheet" href="<?= e(url('build/' . $css)) ?>"><?php endforeach;
    ?><div id="root" data-shiftsync="<?= e(json_encode($context, JSON_THROW_ON_ERROR)) ?>"><p class="app-starting">Opening your workspace…</p></div>
    <script src="<?= e(url('assets/js/boot.js')) ?>"></script><script type="module" src="<?= e(url('build/' . $entry['file'])) ?>"></script>
    <noscript><p class="notice container">Enable JavaScript to use the roster workspace. <a href="<?= e(url('availability.php')) ?>">The availability form works without JavaScript.</a></p></noscript>
<?php endif; Page::foot(); ?>
