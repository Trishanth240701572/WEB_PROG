<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';
try {
    $actor = Auth::user();
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') throw new DomainError('Exports use GET.', 405, 'method_not_allowed');
    $type = Input::query('type', 'workload');
    if ($actor['role'] !== 'supervisor' && $type === 'coverage') throw new DomainError('Coverage exports require a supervisor account.', 403, 'forbidden');
    $week = Input::query('week');
    $lab = Input::query('lab', 'all');
    $report = Domain::report(store()->read(), $actor, $week, $lab, Input::query('status', 'all'), Input::query('staffId', 'all'));
    $rows = Csv::rows($report, $type);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="shiftsync-' . $type . '-' . $report['week'] . '.csv"');
    $output = fopen('php://output', 'wb');
    foreach ($rows as $row) fputcsv($output, array_map([Csv::class, 'safe'], $row), ',', '"', '', "\r\n");
    fclose($output);
} catch (Throwable $error) { Response::error($error); }
