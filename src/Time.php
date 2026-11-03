<?php
declare(strict_types=1);

final class Time
{
    private static ?string $zone = null;
    private static ?string $clock = null;

    /** Only application/test configuration may call this, never request data. */
    public static function configure(string $timezone = 'Asia/Kolkata', ?string $now = null): void
    {
        new DateTimeZone($timezone);
        self::$zone = $timezone;
        self::$clock = $now;
    }

    public static function timezone(): string
    {
        return self::$zone ?? (getenv('SHIFTSYNC_TIMEZONE') ?: 'Asia/Kolkata');
    }

    public static function now(): DateTimeImmutable
    {
        $clock = self::$clock;
        if ($clock === null && getenv('SHIFTSYNC_ENV') === 'test') {
            $clock = getenv('SHIFTSYNC_TEST_NOW') ?: null;
        }
        return new DateTimeImmutable($clock ?? 'now', new DateTimeZone(self::timezone()));
    }

    public static function iso(): string
    {
        return self::now()->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }

    public static function date(string $date): DateTimeImmutable
    {
        $value = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone(self::timezone()));
        if (!$value || $value->format('Y-m-d') !== $date) {
            throw new DomainError('Use a valid local date.', 422, 'invalid_date', ['date' => 'Use YYYY-MM-DD.']);
        }
        return $value;
    }

    public static function week(?string $week = null): string
    {
        if ($week === null) {
            return self::now()->modify('next monday')->format('Y-m-d');
        }
        $date = self::date($week);
        if ($date->format('N') !== '1') {
            throw new DomainError('A roster week must begin on Monday.', 422, 'invalid_week', ['week' => 'Select a Monday.']);
        }
        return $week;
    }

    public static function dates(string $week): array
    {
        $monday = self::date(self::week($week));
        return array_map(fn(int $day): string => $monday->modify("+$day days")->format('Y-m-d'), range(0, 4));
    }

    public static function slotTimes(string $date, string $block): array
    {
        $times = ['morning' => ['09:00', '12:00'], 'afternoon' => ['13:00', '16:00']];
        if (!isset($times[$block])) {
            throw new DomainError('Choose morning or afternoon.', 422, 'invalid_block');
        }
        $day = self::date($date);
        if ((int)$day->format('N') > 5) {
            throw new DomainError('Duty blocks are Monday to Friday only.', 422, 'invalid_date');
        }
        return array_map(fn(string $time): string => (new DateTimeImmutable("$date $time", new DateTimeZone(self::timezone())))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'), $times[$block]);
    }

    public static function future(string $startsAt): bool
    {
        return new DateTimeImmutable($startsAt) > self::now();
    }

    public static function overlap(array $a, array $b): bool
    {
        return strtotime($a['startsAt']) < strtotime($b['endsAt']) && strtotime($a['endsAt']) > strtotime($b['startsAt']);
    }

    public static function hours(array $slot): float
    {
        return (strtotime($slot['endsAt']) - strtotime($slot['startsAt'])) / 3600;
    }
}
