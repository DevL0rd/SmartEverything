import type {
  PlannerBedtime,
  PlannerBedtimeNight,
  PlannerBedtimeWindow,
} from '@smarteverything/domain';

const MINUTE_MS = 60_000;

export type BedtimeMomentKind = 'reminder' | 'wind_down' | 'bed' | 'wake';

export interface BedtimeMoment {
  readonly kind: BedtimeMomentKind;
  readonly at: Date;
  readonly window: PlannerBedtimeWindow;
}

function instantOn(date: Temporal.PlainDate, time: string, zone: string): Temporal.Instant {
  return date
    .toZonedDateTime({
      timeZone: zone,
      plainTime: Temporal.PlainTime.from(time),
    })
    .toInstant();
}

function nightOn(
  bedtime: PlannerBedtime,
  date: Temporal.PlainDate,
): PlannerBedtimeNight | undefined {
  return bedtime.schedule.find((night) => night.days.includes(date.dayOfWeek % 7));
}

export function windowOn(
  bedtime: PlannerBedtime,
  date: Temporal.PlainDate,
  zone: string,
): PlannerBedtimeWindow | null {
  const night = nightOn(bedtime, date);
  if (night === undefined) return null;
  const bed = instantOn(date, night.bed, zone);
  const wake = instantOn(night.wake > night.bed ? date : date.add({ days: 1 }), night.wake, zone);
  if (Temporal.Instant.compare(bed, wake) >= 0) return null;
  const windDown =
    bedtime.wind_down_minutes === null ? bed : bed.subtract({ minutes: bedtime.wind_down_minutes });
  return {
    windDownAt: windDown.toString(),
    bedAt: bed.toString(),
    wakeAt: wake.toString(),
  };
}

export function upcomingWindows(
  bedtime: PlannerBedtime,
  now: Date,
  zone: string,
  count: number,
): readonly PlannerBedtimeWindow[] {
  if (!bedtime.enabled || bedtime.schedule.length === 0) return [];
  const windows: PlannerBedtimeWindow[] = [];
  let date = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .subtract({ days: 1 });
  while (windows.length < count) {
    const window = windowOn(bedtime, date, zone);
    if (window !== null && Date.parse(window.wakeAt) > now.getTime()) windows.push(window);
    date = date.add({ days: 1 });
  }
  return windows;
}

export function momentsOf(
  bedtime: PlannerBedtime,
  windows: readonly PlannerBedtimeWindow[],
  now: Date,
): readonly BedtimeMoment[] {
  const all = windows.flatMap((window): BedtimeMoment[] => {
    const at = (iso: string, kind: BedtimeMomentKind): BedtimeMoment => ({
      kind,
      at: new Date(Date.parse(iso)),
      window,
    });
    return [
      ...(bedtime.reminder_minutes === null
        ? []
        : [
            {
              kind: 'reminder' as const,
              at: new Date(Date.parse(window.bedAt) - bedtime.reminder_minutes * MINUTE_MS),
              window,
            },
          ]),
      ...(bedtime.wind_down_minutes === null ? [] : [at(window.windDownAt, 'wind_down')]),
      at(window.bedAt, 'bed'),
      at(window.wakeAt, 'wake'),
    ];
  });
  return all.filter((moment) => moment.at.getTime() > now.getTime());
}
