import { createHash } from 'node:crypto';
import {
  WATCH_CONFIG,
  type DeviceRow,
  type PlannerAlarmRow,
  type PlannerWatchLink,
  type WatchActionRequest,
  type WatchAlarm,
} from '@smarteverything/domain';
import type { WatchOutcome } from '../local/watch-actions';
import { WATCH_DRIVER } from '../local/watch-driver';
import type { PlannerAlarmPatch } from '../store/repositories/planner-alarms';

export const WATCH_ALARM_LIMIT = 30;

export const IMPORTED_SMART_MINUTES = 30;

export type WatchContent = Pick<WatchAlarm, 'time' | 'days' | 'enabled' | 'smart'>;

export type WatchProjectable = Pick<
  PlannerAlarmRow,
  'time' | 'days' | 'once_on' | 'skip_on' | 'enabled' | 'smart_minutes'
>;

export type Projection =
  | { readonly representable: true; readonly content: WatchContent; readonly hash: string }
  | { readonly representable: false; readonly reason: string };

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type WatchDay = WatchAlarm['days'][number];

function watchDayOf(day: number): WatchDay {
  return WEEKDAYS[(day + 6) % 7] ?? 'mon';
}

function plannerDayOf(day: WatchDay): number {
  return (WEEKDAYS.indexOf(day) + 1) % 7;
}

function inWatchOrder(days: readonly WatchDay[]): WatchDay[] {
  return WEEKDAYS.filter((day) => days.includes(day));
}

export function watchHash(content: WatchContent): string {
  const { time, enabled, smart } = content;
  return createHash('sha256')
    .update(JSON.stringify({ time, days: inWatchOrder(content.days), enabled, smart }))
    .digest('hex');
}

export function projectAlarm(alarm: WatchProjectable): Projection {
  if (alarm.once_on !== null) {
    return {
      representable: false,
      reason: 'Rings once on a date, and the watch only repeats on weekdays.',
    };
  }
  if (alarm.skip_on !== null) {
    return {
      representable: false,
      reason: 'The next ring is skipped, and the watch cannot skip a single ring.',
    };
  }
  const content: WatchContent = {
    time: alarm.time,
    days: inWatchOrder(alarm.days.map(watchDayOf)),
    enabled: alarm.enabled,
    smart: alarm.smart_minutes !== null,
  };
  return { representable: true, content, hash: watchHash(content) };
}

export function plannerDaysOf(days: readonly WatchDay[]): number[] {
  return inWatchOrder(days).map(plannerDayOf);
}

export function sameLink(left: PlannerWatchLink, right: PlannerWatchLink): boolean {
  return (
    left.deviceId === right.deviceId &&
    left.alarmId === right.alarmId &&
    left.hash === right.hash &&
    left.state === right.state &&
    left.detail === right.detail
  );
}

export function linkOf(
  links: readonly PlannerWatchLink[],
  deviceId: string,
): PlannerWatchLink | undefined {
  return links.find((link) => link.deviceId === deviceId);
}

export function withLink(
  links: readonly PlannerWatchLink[],
  deviceId: string,
  next: PlannerWatchLink | null,
): readonly PlannerWatchLink[] {
  const others = links.filter((link) => link.deviceId !== deviceId);
  return next === null ? others : [...others, next];
}

export interface WatchChannel {
  readonly send: (deviceId: string, action: WatchActionRequest) => Promise<WatchOutcome>;
}

export type Exposed = Extract<Projection, { readonly representable: true }>;

export interface Settled {
  readonly link: PlannerWatchLink | null;
  readonly fields: PlannerAlarmPatch;
}

export interface PassInput {
  readonly deviceId: string;
  readonly retries: (alarmId: string) => boolean;
  readonly force: boolean;
  readonly watchAlarms: readonly WatchAlarm[];
  readonly claimed: ReadonlySet<number>;
  readonly gone: ReadonlySet<number>;
}

export function isWatchDevice(device: DeviceRow): boolean {
  return device.provider === 'local' && device.details['driver'] === WATCH_DRIVER;
}

export function alarmsOnWatch(device: DeviceRow): readonly WatchAlarm[] | null {
  const config = WATCH_CONFIG.safeParse(device.details['config']);
  return config.success ? config.data.alarms : null;
}

export function aimsAt(alarm: PlannerAlarmRow, deviceId: string): boolean {
  return alarm.targets.some((target) => target.kind === 'device' && target.deviceId === deviceId);
}

export function synced(deviceId: string, alarmId: number, hash: string): PlannerWatchLink {
  return { deviceId, alarmId, hash, state: 'synced', detail: null };
}

export function changed(
  previous: PlannerWatchLink | undefined,
  next: PlannerWatchLink | null,
  fields: PlannerAlarmPatch = {},
): Settled | null {
  const unchanged =
    next === null ? previous === undefined : previous !== undefined && sameLink(previous, next);
  return unchanged && Object.keys(fields).length === 0 ? null : { link: next, fields };
}

const FULL: WatchOutcome = {
  ok: false,
  reason: 'refused',
  detail: `The watch already holds ${String(WATCH_ALARM_LIMIT)} alarms, its limit. Delete one on the watch or in Planner to make room.`,
};

export class DevicePass {
  private readonly pool = new Map<number, WatchAlarm>();
  private readonly present = new Map<number, WatchAlarm>();
  private count: number;
  private retrying = true;

  constructor(
    private readonly channel: WatchChannel,
    private readonly input: PassInput,
  ) {
    this.count = input.watchAlarms.length;
    for (const alarm of input.watchAlarms) {
      if (alarm.id === null) continue;
      this.present.set(alarm.id, alarm);
      if (!input.claimed.has(alarm.id) && !input.gone.has(alarm.id)) {
        this.pool.set(alarm.id, alarm);
      }
    }
  }

  async settle(
    alarm: PlannerAlarmRow,
    link: PlannerWatchLink | undefined,
  ): Promise<Settled | null> {
    if (!aimsAt(alarm, this.input.deviceId)) {
      return this.withdraw(link, null);
    }
    this.retrying = this.input.retries(alarm.id);
    const projection = projectAlarm(alarm);
    return projection.representable
      ? this.sync(alarm, link, projection)
      : this.withdraw(link, projection.reason);
  }

  leftOnWatch(): readonly WatchAlarm[] {
    return [...this.pool.values()];
  }

  private async withdraw(
    link: PlannerWatchLink | undefined,
    reason: string | null,
  ): Promise<Settled | null> {
    const { deviceId } = this.input;
    if (link === undefined) {
      return reason === null ? null : changed(link, this.absent(reason));
    }
    if (link.alarmId !== null && this.present.has(link.alarmId)) {
      const outcome = await this.channel.send(deviceId, { type: 'delete_alarm', id: link.alarmId });
      if (!outcome.ok) {
        return changed(link, this.failure(link, outcome));
      }
      this.count -= 1;
    }
    return changed(link, reason === null ? null : this.absent(reason));
  }

  private absent(reason: string): PlannerWatchLink {
    return {
      deviceId: this.input.deviceId,
      alarmId: null,
      hash: null,
      state: 'not_on_watch',
      detail: reason,
    };
  }

  private failure(link: PlannerWatchLink | undefined, outcome: WatchOutcome): PlannerWatchLink {
    return {
      deviceId: this.input.deviceId,
      alarmId: link?.alarmId ?? null,
      hash: link?.hash ?? null,
      state: !outcome.ok && outcome.reason === 'refused' ? 'failed' : 'pending',
      detail: outcome.detail,
    };
  }

  private async sync(
    alarm: PlannerAlarmRow,
    link: PlannerWatchLink | undefined,
    projection: Exposed,
  ): Promise<Settled | null> {
    const found = this.locate(link, projection);
    const id = found?.id ?? null;
    if (found !== undefined && id !== null) {
      return this.syncExisting(alarm, link, projection, { watch: found, id });
    }
    const awaiting =
      link?.state === 'synced' && link.alarmId === null && link.hash === projection.hash;
    return awaiting && !this.input.force ? null : this.push(link, projection, null);
  }

  private locate(link: PlannerWatchLink | undefined, projection: Exposed): WatchAlarm | undefined {
    const linked = link?.alarmId ?? null;
    if (linked !== null) {
      return this.present.get(linked);
    }
    const adopted = [...this.pool.values()].find(
      (candidate) => candidate.time === projection.content.time,
    );
    const adoptedId = adopted?.id ?? null;
    if (adoptedId !== null) {
      this.pool.delete(adoptedId);
    }
    return adopted;
  }

  private async syncExisting(
    alarm: PlannerAlarmRow,
    link: PlannerWatchLink | undefined,
    projection: Exposed,
    located: { readonly watch: WatchAlarm; readonly id: number },
  ): Promise<Settled | null> {
    const { watch: found, id } = located;
    const current = watchHash(found);
    if (current === projection.hash) {
      return changed(link, synced(this.input.deviceId, id, current));
    }
    if (link?.alarmId === id && link.hash === projection.hash) {
      return changed(link, synced(this.input.deviceId, id, current), {
        time: found.time,
        days: plannerDaysOf(found.days),
        enabled: found.enabled,
        smart_minutes: found.smart ? (alarm.smart_minutes ?? IMPORTED_SMART_MINUTES) : null,
      });
    }
    return this.push(link, projection, id);
  }

  private async push(
    link: PlannerWatchLink | undefined,
    projection: Exposed,
    id: number | null,
  ): Promise<Settled | null> {
    if (link?.state === 'failed' && !this.retrying) {
      return null;
    }
    if (id === null && this.count >= WATCH_ALARM_LIMIT) {
      return changed(link, this.failure(link, FULL));
    }
    return this.transmit(link, projection, id);
  }

  private async transmit(
    link: PlannerWatchLink | undefined,
    projection: Exposed,
    id: number | null,
  ): Promise<Settled | null> {
    const { deviceId } = this.input;
    const outcome = await this.channel.send(deviceId, {
      type: 'save_alarm',
      alarm: { ...projection.content, id },
    });
    if (!outcome.ok) {
      return changed(link, {
        ...this.failure(link, outcome),
        alarmId: id ?? link?.alarmId ?? null,
      });
    }
    this.count += id === null ? 1 : 0;
    return changed(link, {
      deviceId,
      alarmId: id,
      hash: projection.hash,
      state: 'synced',
      detail: null,
    });
  }
}
