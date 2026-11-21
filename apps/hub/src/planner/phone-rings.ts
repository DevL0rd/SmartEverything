import {
  PLANNER_ALARM_SOUND,
  PLANNER_BEDTIME_NIGHT,
  PLANNER_CHALLENGE,
  PLANNER_DAYS,
  PLANNER_LOCAL_DATE,
  type PlannerPhoneRingSet,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import { PendingWork } from './pending-work';

const ID = z.uuid();

export const PHONE_RING_ALARM = z
  .strictObject({
    id: ID,
    profileId: ID,
    label: z.string().min(1).nullable(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    days: PLANNER_DAYS,
    onceOn: PLANNER_LOCAL_DATE.nullable(),
    skipOn: PLANNER_LOCAL_DATE.nullable(),
    sound: PLANNER_ALARM_SOUND,
    rampSeconds: z.int().nonnegative(),
    vibrate: z.boolean(),
    snoozeMinutes: z.int().positive(),
    snoozeLimit: z.int().positive().nullable(),
    challenge: PLANNER_CHALLENGE,
  })
  .readonly();

export const PHONE_RING_TIMER = z
  .strictObject({
    id: ID,
    profileId: ID,
    label: z.string().min(1).nullable(),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .readonly();

export const PHONE_RING_BEDTIME = z
  .strictObject({
    schedule: z.array(PLANNER_BEDTIME_NIGHT).readonly(),
    windDownMinutes: z.int().positive().nullable(),
  })
  .readonly();

export const PHONE_RING_SET = z
  .strictObject({
    version: z.string().min(1),
    zone: z.string().min(1),
    alarms: z.array(PHONE_RING_ALARM).readonly(),
    timers: z.array(PHONE_RING_TIMER).readonly(),
    timerSound: PLANNER_ALARM_SOUND,
    bedtime: PHONE_RING_BEDTIME.nullable(),
    media: z.array(z.string().min(1)).readonly(),
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

export type PhoneRingStore = Pick<Store, 'host' | 'feed'>;

export interface PhoneRingsOptions {
  readonly store: PhoneRingStore;
  readonly channel: PhoneRingChannel;
  readonly now: () => Date;
  readonly log: Logger;
}

class Pushing {
  readonly run: Coalesced;
  private forced = false;

  constructor(work: (force: boolean) => Promise<void>, failed: (cause: unknown) => void) {
    this.run = new Coalesced(() => work(this.take()), failed);
  }

  request(force: boolean): void {
    this.forced ||= force;
    this.run.trigger();
  }

  private take(): boolean {
    const force = this.forced;
    this.forced = false;
    return force;
  }
}

export class PhoneRings {
  private readonly states = new Map<string, PhoneRingState>();
  private readonly pushing = new Map<string, Pushing>();
  private readonly work = new PendingWork('planner.phone_ring_push_failed');
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: PhoneRingsOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      if (change.table === 'planner_alarms' || change.table === 'planner_timers') {
        this.follow(
          this.options.store.host.read('plannerRingClients', {
            targets: [...(change.record?.targets ?? []), ...(change.oldRecord?.targets ?? [])],
          }),
        );
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
    for (const pushing of this.pushing.values()) {
      background(pushing.run.stop(), 'planner.phone_ring_stop_failed');
    }
    this.pushing.clear();
  }

  async settled(): Promise<void> {
    do {
      await this.work.settled();
      await Promise.all([...this.pushing.values()].map((pushing) => pushing.run.idle()));
    } while ([...this.pushing.values()].some((pushing) => pushing.run.busy));
    await this.work.settled();
  }

  connected(clientId: string): void {
    this.follow(
      this.options.store.host.read('plannerRingClientIds', { clientIds: [clientId] }),
      true,
    );
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

  desired(clientId: string): Promise<PhoneRingSet> {
    return this.options.store.host.read('plannerPhoneRingSet', { clientId });
  }

  async read(clientId: string, profileId: string): Promise<PlannerPhoneRingSet> {
    const { set, rings } = await this.options.store.host.read('plannerPhoneRingRead', {
      clientId,
      profileId,
      nowMs: this.options.now().getTime(),
    });
    if (this.states.get(clientId)?.version !== set.version) {
      this.states.set(clientId, { version: set.version, reached: true, ackedAt: null });
    }
    return rings;
  }

  preferencesChanged(profileId: string): void {
    this.follow(this.options.store.host.read('plannerProfileRingClients', { profileId }));
  }

  private follow(clients: Promise<readonly string[]>, force = false): void {
    this.work.run(
      clients.then((found) => {
        for (const clientId of found) this.push(clientId, force);
      }),
    );
  }

  private push(clientId: string, force: boolean): void {
    if (this.unsubscribe === null) return;
    const pushing =
      this.pushing.get(clientId) ??
      new Pushing(
        (forced) => this.pushNow(clientId, forced),
        (cause) => {
          this.options.log.error('planner.phone_ring_push_failed', cause, { clientId });
        },
      );
    this.pushing.set(clientId, pushing);
    pushing.request(force);
  }

  private async pushNow(clientId: string, force: boolean): Promise<void> {
    const set = await this.desired(clientId);
    if (!force && this.states.get(clientId)?.version === set.version) {
      return;
    }
    this.states.set(clientId, { version: set.version, reached: false, ackedAt: null });
    this.work.run(this.deliver(clientId, set), { clientId });
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
}
