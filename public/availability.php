<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/src/bootstrap.php';
$user = Auth::pageUser('staff');
$state = store()->read();
$error = null;
$conflict = false;
$success = isset($_GET['saved']);
$inputWeek = $_POST['week'] ?? $_GET['week'] ?? null;
try {
    $week = Time::week(is_string($inputWeek) ? $inputWeek : null);
} catch (DomainError $exception) {
    $week = Time::week(); $error = $exception->getMessage();
}
$dates = Time::dates($week);
$view = Domain::availability($state, $user, $week);
$values = $view['values'];
$savedValues = $values;
$version = $view['version'];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $success = false;
    $rawVersion = $_POST['version'] ?? null;
    $version = is_string($rawVersion) && strlen($rawVersion) <= 10 && ctype_digit($rawVersion) ? (int)$rawVersion : null;
    $posted = $_POST['values'] ?? [];
    if (is_array($posted)) foreach ($dates as $date) foreach (['morning', 'afternoon'] as $block) {
        if (is_string($posted[$date][$block] ?? null)) $values[$date][$block] = $posted[$date][$block];
    }
    try {
        Csrf::check(is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : null);
        if ($error) throw new DomainError($error, 422, 'invalid_week');
        // Authenticated identity is used; posted staff IDs are never accepted.
        store()->transaction(static function (array &$current) use ($user, $week, $values, $version): mixed {
            $actor = $current['users'][$user['id']] ?? [];
            return Domain::command($current, $actor, 'availability.save', ['week' => $week, 'version' => $version, 'values' => $values]);
        });
        redirect('availability.php?week=' . rawurlencode($week) . '&saved=1');
    } catch (DomainError $exception) {
        http_response_code($exception->status); $error = $exception->getMessage();
        $conflict = in_array($exception->errorCode, ['stale_version', 'version_required'], true);
    }
}
$count = 0;
foreach ($values as $blocks) foreach ($blocks as $value) if ($value === 'available') $count++;
$weekLabel = (new DateTimeImmutable($week, new DateTimeZone('Asia/Kolkata')))->format('j M') . ' – ' . (new DateTimeImmutable(end($dates), new DateTimeZone('Asia/Kolkata')))->format('j M Y');
$csrf = Csrf::token();
Page::head('My availability');
?>
<div class="app-shell"><?php Page::sidebar($user); ?><div class="workspace">
<header class="page-header"><div><div class="page-subtitle">Plan your week</div><h1 class="page-title">My availability</h1></div><a class="btn btn-secondary" href="<?= e(url('app.php#/roster')) ?>">View roster <span aria-hidden="true">↗</span></a></header>
<main id="main" class="page-content availability-page">
    <p class="muted">Give your supervisor a clear picture of when you can help. All times are in Asia/Kolkata.</p>
    <form method="get" action="<?= e(url('availability.php')) ?>" class="week-select-form">
        <div><label class="form-label" for="week">Week starting Monday</label><input class="form-control" type="date" id="week" name="week" value="<?= e($week) ?>" required></div><button class="btn btn-secondary" type="submit">Open week</button><span class="muted"><?= e($weekLabel) ?></span>
    </form>
    <?php if ($error): ?><div class="notice notice-error" role="alert" tabindex="-1"><strong>Availability was not saved</strong><p><?= e($error) ?></p><a href="#availability-form">Review your choices</a><?php if ($conflict): ?><p>Your unsaved choices remain below. Copy any choices you want to keep before <a href="<?= e(url('availability.php?week=' . rawurlencode($week))) ?>">reloading the saved week and discarding this form</a>.</p><?php endif; ?></div><?php endif; ?>
    <?php if ($success): ?><div class="notice notice-success" role="status">Your availability is saved for <?= e($weekLabel) ?>.</div><?php endif; ?>
    <section class="panel" aria-labelledby="availability-heading">
        <div class="panel-head"><div><h2 id="availability-heading">Your available blocks</h2><p class="muted">Unknown availability is never treated as available.</p></div><span class="pill"><span id="available-count"><?= $count ?></span> of 10 available</span></div>
        <form id="availability-form" method="post" action="<?= e(url('handlers/availability.php')) ?>" data-conflict="<?= $conflict ? 'true' : 'false' ?>" data-save-error="<?= $error ? 'true' : 'false' ?>" data-baseline="<?= e(json_encode($savedValues, JSON_THROW_ON_ERROR)) ?>">
            <input type="hidden" name="csrf" value="<?= e(Csrf::token()) ?>"><input type="hidden" name="week" value="<?= e($week) ?>">
            <input type="hidden" name="version" value="<?= e($version) ?>">
            <div class="availability-actions js-only"><span class="muted">Set future blocks:</span><button class="btn btn-secondary" type="button" data-fill="available">All available</button><button class="btn btn-quiet" type="button" data-fill="not_submitted">Clear choices</button></div>
            <div class="availability-grid">
            <?php foreach ($dates as $date): $displayDate = new DateTimeImmutable($date, new DateTimeZone('Asia/Kolkata')); ?>
                <fieldset class="availability-day"><legend><strong><?= e($displayDate->format('l')) ?></strong><span class="muted"><?= e($displayDate->format('j M')) ?></span></legend>
                <?php foreach (['morning' => '09:00–12:00', 'afternoon' => '13:00–16:00'] as $block => $hours):
                    $times = Time::slotTimes($date, $block); $started = !Time::future($times[0]); $fieldId = 'availability-' . $date . '-' . $block;
                ?>
                <div class="availability-cell"><label for="<?= e($fieldId) ?>"><strong><?= ucfirst($block) ?></strong><span class="muted"><?= $hours ?> IST</span></label>
                <?php if ($started): ?><input type="hidden" name="values[<?= $date ?>][<?= $block ?>]" value="<?= e($values[$date][$block]) ?>"><?php endif; ?>
                <select class="form-select availability-select" id="<?= e($fieldId) ?>" name="values[<?= $date ?>][<?= $block ?>]" <?= $started ? 'disabled' : '' ?>>
                    <?php foreach (['not_submitted' => 'Not submitted', 'available' => 'Available', 'unavailable' => 'Unavailable'] as $value => $label): ?><option value="<?= $value ?>" <?= $values[$date][$block] === $value ? 'selected' : '' ?>><?= $label ?></option><?php endforeach; ?>
                </select><?php if ($started): ?><small class="muted">This block has started.</small><?php endif; ?></div>
                <?php endforeach; ?><button type="button" class="btn btn-quiet js-only" data-fill-day="<?= $date ?>">Set day available</button></fieldset>
            <?php endforeach; ?>
            </div>
            <div class="availability-save"><p id="save-status" class="muted" role="status" aria-live="polite"><?= $error ? 'Your choices have not been saved' : ($success ? 'All changes saved' : 'Your current saved choices') ?></p><button type="submit" class="btn btn-primary" id="save-availability">Save availability <span aria-hidden="true">→</span></button></div>
        </form>
    </section>
    <section class="availability-help"><h2>Planning with your team</h2><button class="btn btn-quiet js-only" type="button" data-bs-toggle="collapse" data-bs-target="#availability-help" aria-expanded="false" aria-controls="availability-help">How availability works <span aria-hidden="true">⌄</span></button><div class="collapse" id="availability-help"><p>Choose <strong>Available</strong> only for blocks you can cover. You may save a partially completed week. A published or draft duty prevents making its block unavailable; request an exchange from My shifts instead.</p><p>Your supervisor uses these choices for planning. Staff see your published duties, not your private availability.</p></div></section>
</main></div></div>
<script defer src="<?= e(url('assets/vendor/bootstrap.bundle.min.js')) ?>"></script><script defer src="<?= e(url('assets/js/availability.js')) ?>"></script>
<?php Page::foot(); ?>
