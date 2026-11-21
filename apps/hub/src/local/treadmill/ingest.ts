import {
  JSON_VALUE,
  openSummary,
  zoneOffsetSeconds,
  type AdapterSink,
  type ClientRow,
  type DeviceRow,
  type JsonValue,
  type MachineEvent,
  type MachineSettings,
  type PadPreferences,
  type SessionSummary,
  type TreadmillBatchResult,
  type TreadmillFrameBatch,
  type TreadmillLiveNotice,
  type TreadmillSession,
} from '@smarteverything/domain';
import type { PadRecord } from '@smarteverything/ble';
import { background, type Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { IngestQueues } from '../ingest-queue';
import type { LocalDevices } from '../local-devices';
import { replayNotes } from '../unit-notes';
import { chosenWalkerOf } from './access';
import { keepRecords } from './backfill';
import { entrySettingsOf } from './config';
import { admitActivity, eventOf, type EventSpec } from './events';
import { contextOf } from './figures';
import type { DeviceState, Fleet, WalkerNow } from './fleet';
import {
  heartSourceOf,
  liveFrameOf,
  mayShowBody,
  noticeOf,
  shownState,
  type FrameFacts,
} from './live';
import type { Publisher } from './publisher';
import type { BatchResult } from './runtime';

const DAY_MS = 86_400_000;

export interface LivePublisher {
  readonly watched: (deviceId: string) => boolean;
  readonly publish: (
    deviceId: string,
    noticeFor: (client: ClientRow) => TreadmillLiveNotice | null,
  ) => void;
}

export interface IngestDeps {
  readonly store: Pick<Store, 'host' | 'settings' | 'profiles'>;
  readonly fleet: Fleet;
  readonly publisher: Publisher;
  readonly sink: () => AdapterSink;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly live: LivePublisher;
  readonly holderOf: (device: DeviceRow) => string | null;
  readonly now: () => Date;
  readonly log: Logger;
}

function goalReached(pad: PadPreferences, summary: SessionSummary): boolean {
  const kind = pad.goalKind ?? 'none';
  const value = pad.goalValue ?? 0;
  if (kind === 'none' || value <= 0) {
    return false;
  }
  const progress = {
    distance: summary.distanceM,
    time: summary.activeSeconds,
    calories: summary.kcal ?? 0,
  }[kind];
  return progress >= value;
}

export class TreadmillIngest {
  private readonly queues = new IngestQueues();

  constructor(private readonly deps: IngestDeps) {}

  idle(): Promise<void> {
    return this.queues.idle();
  }

  process(
    device: DeviceRow,
    client: Pick<ClientRow, 'id'>,
    batch: TreadmillFrameBatch,
  ): Promise<TreadmillBatchResult> {
    return this.queues.run(device.id, () => this.ingest(device, client, batch));
  }

  private async ingest(
    device: DeviceRow,
    client: Pick<ClientRow, 'id'>,
    batch: TreadmillFrameBatch,
  ): Promise<TreadmillBatchResult> {
    const state = await this.deps.fleet.ensure(device);
    const now = this.deps.now().toISOString();
    const phaseBefore = state.link.phase;
    state.setLink(batch.link, now);
    state.note(batch.frames);
    const walker = await this.walkerFacts(device);
    state.walker = walker;
    const settings = entrySettingsOf(state.entry);
    const machine: MachineSettings = {
      weightKg: walker.weightKg,
      gradePercent: settings.gradePercent,
      runSwitchKmh: settings.runSwitchKmh,
    };
    await state.keeper.use(
      contextOf(settings, walker.weightKg, state.runtime.identity.inclineMaxPercent !== null),
    );
    if (batch.link.phase !== 'linked') {
      state.runtime.linkInterrupted();
    }
    const result = state.runtime.ingest(batch.frames, machine);
    await this.apply(device, state, result, walker);
    this.publishChanges(device, state, { phaseBefore, result, now });
    this.publishLive(device, state, walker, now);
    state.notifyWaiters();
    this.deps.log.debug('treadmill.batch_ingested', () => ({
      device: device.id,
      client: client.id,
      frames: batch.frames.length,
      state: state.runtime.machine.state,
    }));
    return { live: this.deps.live.watched(device.id), accepted: batch.frames.length };
  }

  walkerFacts(device: DeviceRow): Promise<WalkerNow> {
    return this.deps.store.host.read('treadmillWalker', {
      chosen: chosenWalkerOf(device),
      holder: this.deps.holderOf(device),
      now: this.deps.now().toISOString(),
    });
  }

  private async apply(
    device: DeviceRow,
    state: DeviceState,
    result: BatchResult,
    walker: WalkerNow,
  ): Promise<void> {
    this.logOddities(device, result);
    for (const entry of result.timeline) {
      if (entry.kind === 'tick') {
        state.keeper.tick(entry.sample, entry.beltKcal);
      } else {
        await this.handle(state, entry.event, walker);
      }
    }
    for (const record of result.records) {
      await this.recordFound(device, state, record, walker);
    }
    const last = result.snapshots.at(-1);
    if (last === undefined) {
      return;
    }
    if (state.keeper.active !== null) {
      state.keeper.noteHeart(heartSourceOf(state, walker.heartRate));
    }
    await state.keeper.flush(state.runtime.machine, last.at, {
      walkerProfileId: walker.profileId,
    });
    for (const snapshot of result.snapshots) {
      this.deps.publisher.snapshot(
        state,
        { ...snapshot, state: shownState(snapshot.state, state.runtime) },
        state.updateCadence(snapshot),
      );
    }
    this.checkGoal(state, last.at, walker);
  }

  private async recordFound(
    device: DeviceRow,
    state: DeviceState,
    record: PadRecord,
    walker: WalkerNow,
  ): Promise<void> {
    const { store, now, log } = this.deps;
    const seen = device.details['padRecordSeen'];
    const timeZone = store.settings.read().time_zone;
    const at = now();
    const done = await store.host.write('treadmillReconcile', {
      facts: {
        deviceId: device.id,
        walkerProfileId: walker.profileId,
        zoneOffsetSeconds: zoneOffsetSeconds(timeZone, at),
        seen: typeof seen === 'string' ? seen : null,
      },
      record,
      now: at.toISOString(),
    });
    replayNotes(log, done.notes);
    state.setRecords(keepRecords(state.padRecords, done.view), record.remaining);
    background(
      this.deps.local.observe(state.entry.externalId, {
        padRecordSeen: done.fingerprint,
        padRecordsRemaining: record.remaining,
      }),
      'treadmill.observe_failed',
      { device: device.id },
    );
  }

  private logOddities(device: DeviceRow, result: BatchResult): void {
    const { log } = this.deps;
    for (const item of result.unreadable) {
      log.warn('treadmill.frame_unreadable', {
        device: device.id,
        characteristic: item.characteristic,
        hex: item.hex,
        reason: item.reason,
      });
    }
    for (const byte of result.unknown) {
      log.info('treadmill.unknown_byte', {
        device: device.id,
        index: byte.index,
        value: byte.value,
      });
    }
  }

  private async handle(state: DeviceState, event: MachineEvent, walker: WalkerNow): Promise<void> {
    const context = { walkerProfileId: walker.profileId };
    switch (event.kind) {
      case 'started':
        await state.keeper.begin(event, context);
        state.armGoal();
        this.activity(state, event.at, { phase: 'started' }, walker);
        return;
      case 'paused':
      case 'resumed':
        this.activity(state, event.at, { phase: event.kind }, walker);
        return;
      case 'finished':
        await this.finished(state, event.summary, walker);
        return;
      case 'safety_stop':
        this.emit(state, { kind: 'fault', at: event.at, details: { code: 'safety_stop' } });
        return;
      case 'button':
        this.emit(state, { kind: 'button', at: event.at, details: { button: event.button } });
        return;
      case 'state_changed':
      case 'speed_changed':
      case 'control_lost':
        return;
    }
  }

  private emit(state: DeviceState, spec: EventSpec): void {
    this.deps.sink().event(eventOf(state, spec));
  }

  private activity(
    state: DeviceState,
    at: string,
    details: Readonly<Record<string, JsonValue>>,
    walker: WalkerNow,
  ): void {
    if (!admitActivity(state, Date.parse(at), this.deps.log)) {
      return;
    }
    this.deps.sink().event(
      eventOf(state, {
        kind: 'activity',
        at,
        details: {
          ...details,
          walker: walker.name,
          profileId: walker.profileId,
        },
      }),
    );
  }

  private async finished(
    state: DeviceState,
    summary: SessionSummary,
    walker: WalkerNow,
  ): Promise<void> {
    const session = await state.keeper.finish(summary, { walkerProfileId: walker.profileId });
    state.wishRecord();
    if (session === null) {
      return;
    }
    this.activity(
      state,
      session.endedAt,
      {
        phase: 'finished',
        distance_m: Math.round(session.distanceM),
        duration_s: Math.round(session.activeSeconds),
        steps: session.steps,
        kind: session.kind,
      },
      walker,
    );
    this.maintenance(state, session);
  }

  private maintenance(state: DeviceState, session: TreadmillSession): void {
    const settings = entrySettingsOf(state.entry);
    const base = settings.lubricatedAt ?? state.entry.createdAt;
    if (Date.parse(session.endedAt) >= Date.parse(base) + settings.lubricationDays * DAY_MS) {
      this.emit(state, {
        kind: 'maintenance',
        at: session.endedAt,
        details: { reason: 'lubrication_due', days: settings.lubricationDays },
        occurrence: `lubrication:${base}`,
      });
    }
  }

  private checkGoal(state: DeviceState, at: string, walker: WalkerNow): void {
    const summary = openSummary(state.runtime.machine, at);
    if (summary !== null && goalReached(state.runtime.pad, summary) && state.takeGoal()) {
      const { goalKind, goalValue } = state.runtime.pad;
      this.activity(
        state,
        at,
        { phase: 'goal_reached', goal: goalKind ?? null, value: goalValue ?? null },
        walker,
      );
    }
  }

  private publishChanges(
    device: DeviceRow,
    state: DeviceState,
    change: { readonly phaseBefore: string; readonly result: BatchResult; readonly now: string },
  ): void {
    const { result, now } = change;
    this.deps.publisher.link(state, state.link.phase, now);
    if (change.phaseBefore !== 'linked' && state.link.phase === 'linked') {
      state.wishRecord();
    }
    if (result.padChanged) {
      this.deps.publisher.pad(state, state.runtime.decoder.family, now);
    }
    const fault = state.runtime.fault;
    if (result.faultChanged && fault !== null) {
      this.emit(state, {
        kind: 'fault',
        at: now,
        details: { code: fault },
        occurrence: `fault:${fault}:${now}`,
      });
    }
    const changed =
      change.phaseBefore !== state.link.phase ||
      result.padChanged ||
      result.identityChanged ||
      result.faultChanged;
    if (changed) {
      background(
        this.deps.local.observe(state.entry.externalId, this.observed(state, now)),
        'treadmill.observe_failed',
        { device: device.id },
      );
    }
  }

  private observed(state: DeviceState, now: string): Readonly<Record<string, JsonValue>> {
    const { link, runtime } = state;
    return {
      linkPhase: link.phase,
      linkRssi: link.rssi,
      linkReconnects: link.reconnects,
      linkDetail: link.detail,
      lastHeardAt: now,
      pad: JSON_VALUE.parse(runtime.pad),
      identity: runtime.identity,
      fault: runtime.fault,
    };
  }

  private publishLive(device: DeviceRow, state: DeviceState, walker: WalkerNow, now: string): void {
    if (!this.deps.live.watched(device.id)) {
      return;
    }
    const { heartRate } = walker;
    const scale = entrySettingsOf(state.entry).inclineScale;
    const facts: FrameFacts = { state, at: now, walker, heartRate, scale };
    this.deps.live.publish(device.id, (client) => {
      const profileId = this.deps.store.profiles.activeOf(client.id).id;
      return noticeOf(device, liveFrameOf(facts, mayShowBody(client, profileId, walker.profileId)));
    });
  }
}
