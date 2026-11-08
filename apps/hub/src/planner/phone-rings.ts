import { createHash } from 'node:crypto';
import {
  PLANNER_DAYS,
  PLANNER_LOCAL_DATE,
  type PlannerAlarmRow,
  type PlannerRingTarget,
  type PlannerTimerRow,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { clientIdOfPhone } from '../phones/phone-device';
import type { Store } from '../store/store';

const ID = z.uuid();

export const PHONE_RING_ALARM = z
  .strictObject({
    id: ID,
    label: z.string().min(1).nullable(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    days: PLANNER_DAYS,
    onceOn: PLANNER_LOCAL_DATE.nullable(),
    skipOn: PLANNER_LOCAL_DATE.nullable(),
    sound: z.string().min(1),
    rampSeconds: z.int().nonnegative(),
    vibrate: z.boolean(),
    snoozeMinutes: z.int().positive(),
  })
  .readonly();

export const PHONE_RING_TIMER = z
  .strictObject({
    id: ID,
    label: z.string().min(1).nullable(),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .readonly();

export const PHONE_RING_SET = z
  .strictObject({
    version: z.string().min(1),
    alarms: z.array(PHONE_RING_ALARM).readonly(),
    timers: z.array(PHONE_RING_TIMER).readonly(),
  })
  .readonly();

export const PHONE_RING_ACK = z.strictObject({ version: z.string().min(1) }).readonly();

export type PhoneRingSet = z.infer<typeof PHONE_RING_SET>;

export interface PhoneRingChannel {
  readonly send: (clientId: string, set: PhoneRingSet) => Promise<boolean>;
}

export interface PhoneRingState {
  readonly version: string;
  readonly reached: boolean;
  readonly ackedAt: string | null;
}

export type PhoneRingStore = Pick<
  Store,
  'plannerAlarms' | 'plannerTimers' | 'clients' | 'devices' | 'feed'
>;

export interface PhoneRingsOptions {
  readonly store: PhoneRingStore;
  readonly channel: PhoneRingChannel;
  readonly now: () => Date;
  readonly log: Logger;
}

type Targeted = Pick<PlannerAlarmRow | PlannerTimerRow, 'targets'>;

function alarmRule(alarm: PlannerAlarmRow): z.infer<typeof PHONE_RING_ALARM> {
  return {
    id: alarm.id,
    label: alarm.label,
    time: alarm.time,
    days: alarm.days,
    onceOn: alarm.once_on,
    skipOn: alarm.skip_on,
    sound: alarm.sound,
    rampSeconds: alarm.ramp_seconds,
    vibrate: alarm.vibrate,
    snoozeMinutes: alarm.snooze_minutes,
  };
}

function timerEnd(timer: PlannerTimerRow): z.infer<typeof PHONE_RING_TIMER>[] {
  return timer.ends_at === null
    ? []
    : [{ id: timer.id, label: timer.label, endsAt: timer.ends_at }];
}

function versionOf(content: Omit<PhoneRingSet, 'version'>): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function byId<T extends { readonly id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

export class PhoneRings {
  private readonly states = new Map<string, PhoneRingState>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: PhoneRingsOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_alarms' || change.table === 'planner_timers') {
        this.changed([change.record, change.oldRecord]);
      } else if (
        change.table === 'clients' &&
        change.operation === 'DELETE' &&
        change.oldRecord !== null
      ) {
        this.states.delete(change.oldRecord.id);
      }
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  connected(clientId: string): void {
    if (this.isPhone(clientId)) {
      this.push(clientId, true);
    }
  }

  acknowledge(clientId: string, version: string): boolean {
    const state = this.states.get(clientId);
    if (state?.version !== version) {
      this.options.log.warn('planner.phone_ring_ack_stale', { clientId, version });
      return false;
    }
    this.states.set(clientId, { ...state, ackedAt: this.options.now().toISOString() });
    return true;
  }

  stateOf(clientId: string): PhoneRingState | undefined {
    return this.states.get(clientId);
  }

  desired(clientId: string): PhoneRingSet {
    const alarms = this.options.store.plannerAlarms
      .enabled()
      .filter((alarm) => this.reaches(alarm, clientId))
      .map(alarmRule)
      .sort(byId);
    const timers = this.options.store.plannerTimers
      .running()
      .filter((timer) => this.reaches(timer, clientId))
      .flatMap(timerEnd)
      .sort(byId);
    return { version: versionOf({ alarms, timers }), alarms, timers };
  }

  private changed(rows: readonly (Targeted | null)[]): void {
    const clients = new Set<string>();
    for (const row of rows) {
      for (const target of row?.targets ?? []) {
        const clientId = this.clientOf(target);
        if (clientId !== null && this.isPhone(clientId)) {
          clients.add(clientId);
        }
      }
    }
    for (const clientId of clients) {
      this.push(clientId, false);
    }
  }

  private push(clientId: string, force: boolean): void {
    const set = this.desired(clientId);
    if (!force && this.states.get(clientId)?.version === set.version) {
      return;
    }
    this.states.set(clientId, { version: set.version, reached: false, ackedAt: null });
    background(this.deliver(clientId, set), 'planner.phone_ring_push_failed', { clientId });
  }

  private async deliver(clientId: string, set: PhoneRingSet): Promise<void> {
    const reached = await this.options.channel.send(clientId, set);
    const state = this.states.get(clientId);
    if (state?.version !== set.version) {
      return;
    }
    this.states.set(clientId, { ...state, reached });
    this.options.log.info(reached ? 'planner.phone_ring_pushed' : 'planner.phone_ring_unreached', {
      clientId,
      version: set.version,
      alarms: set.alarms.length,
      timers: set.timers.length,
    });
  }

  private reaches(row: Targeted, clientId: string): boolean {
    return row.targets.some((target) => this.clientOf(target) === clientId);
  }

  private clientOf(target: PlannerRingTarget): string | null {
    if (target.kind === 'client') {
      return target.clientId;
    }
    const device = this.options.store.devices.find(target.deviceId);
    return device?.kind === 'phone' ? clientIdOfPhone(device.external_id) : null;
  }

  private isPhone(clientId: string): boolean {
    return this.options.store.clients.find(clientId)?.platform === 'android';
  }
}
