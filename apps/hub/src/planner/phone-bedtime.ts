import type { PlannerBedtime, PlannerBedtimeWindow } from '@smarteverything/domain';

const MINUTE_MS = 60_000;

const DAYS_BEFORE = 1;

const DAYS_AHEAD = 7;

function zonedAt(date: Temporal.PlainDate, time: string, zone: string): Temporal.ZonedDateTime {
  return date.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from(time) });
}

export function bedtimeWindows(
  bedtime: PlannerBedtime,
  now: Date,
  zone: string,
): PlannerBedtimeWindow[] {
  if (!bedtime.enabled || !bedtime.do_not_disturb) {
    return [];
  }
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDate();
  const windows: PlannerBedtimeWindow[] = [];
  for (let offset = -DAYS_BEFORE; offset < DAYS_AHEAD; offset += 1) {
    const date = today.add({ days: offset });
    const night = bedtime.schedule.find((entry) => entry.days.includes(date.dayOfWeek % 7));
    if (night === undefined) {
      continue;
    }
    const bed = zonedAt(date, night.bed, zone);
    const wake = zonedAt(night.wake > night.bed ? date : date.add({ days: 1 }), night.wake, zone);
    if (wake.epochMilliseconds <= now.getTime()) {
      continue;
    }
    const windDown =
      bedtime.wind_down_minutes === null
        ? bed
        : bed.subtract({ milliseconds: bedtime.wind_down_minutes * MINUTE_MS });
    windows.push({
      windDownAt: new Date(windDown.epochMilliseconds).toISOString(),
      bedAt: new Date(bed.epochMilliseconds).toISOString(),
      wakeAt: new Date(wake.epochMilliseconds).toISOString(),
    });
  }
  return windows;
}
