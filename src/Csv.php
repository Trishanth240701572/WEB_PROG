<?php
declare(strict_types=1);

final class Csv
{
    /** Prefix formula-like text (including leading whitespace/control bytes) with an apostrophe. */
    public static function safe(mixed $value): string
    {
        $text = (string)$value;
        return preg_match('/^[\x00-\x20]*[=+@\-\t\r\n]/u', $text) ? "'" . $text : $text;
    }

    public static function rows(array $report, string $type): array
    {
        $rows = [];
        if ($type === 'workload') {
            $rows[] = ['week', 'laboratory_filter', 'staff_id', 'staff_name', 'qualification', 'scheduled_duties', 'scheduled_hours'];
            foreach ($report['workload'] as $row) $rows[] = [$report['week'], $report['lab'], $row['staffId'], $row['name'], $row['qualification'], $row['duties'], $row['hours']];
        } elseif ($type === 'coverage') {
            $rows[] = ['week', 'laboratory_filter', 'date', 'block', 'laboratory', 'required_people', 'assigned_people', 'required_technicians', 'assigned_technicians', 'missing_people', 'missing_technicians'];
            foreach ($report['coverage'] as $row) $rows[] = [$report['week'], $report['lab'], $row['date'], $row['block'], $row['lab'], $row['headcount'], $row['assigned'], $row['technicianMinimum'], $row['technicians'], $row['missingPeople'], $row['missingTechnicians']];
        } elseif ($type === 'swaps') {
            $rows[] = ['roster_week', 'laboratory_filter', 'request_id', 'requester_id', 'recipient_id', 'status', 'created_at_utc'];
            foreach ($report['swaps'] as $row) $rows[] = [$report['week'], $report['lab'], $row['id'], $row['requesterId'], $row['recipientId'], $row['status'], $row['createdAt']];
        } else throw new DomainError('Choose a workload, coverage, or swaps export.', 422, 'invalid_report');
        return $rows;
    }
}
