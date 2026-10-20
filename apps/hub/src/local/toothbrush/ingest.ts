import {
  SONICARE_HEAD_LIFETIME_SECONDS,
  worthKeeping,
  wearPercentOf,
  type AdapterSink,
  type BrushBatchResult,
  type BrushFrameBatch,
  type BrushLinkPhase,
  type BrushLiveNotice,
  type BrushingSession,
  type ClientRow,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { Cancel } from '../../clock';
import type { Store } from '../../store/store';
import type { LocalDevices } from '../local-devices';
import { ownsSessions } from './access';
import type { HomeClock } from './clock';
import { entrySettingsOf } from './config';
import { admitEvent, eventOf, type EventSpec } from './events';
import type { DeviceState, Fleet } from './fleet';
import { liveFrameOf, noticeOf } from './live';
import type { BatchOutcome, Found } from './outcome';
import type { Publisher } from './publisher';
import type { MachineEvent } from './session-machine';
import { BrushingLog, type LogContext, type Logged } from './sessions';

const RECENT_SESSION_MS = 15 * 60_000;

export interface LivePublisher {
  readonly watched: (deviceId: string) => boolean;
  readonly publish: (
    deviceId: string,
    noticeFor: (client: ClientRow) => BrushLiveNotice | null,
  ) => void;
}

export interface IngestDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly publisher: Publisher;
  readonly sink: () => AdapterSink;
  readonly local: Pick<LocalDevices, 'observe'>;
  readonly clock: HomeClock;
  readonly live: LivePublisher;
  readonly now: () => Date;
  readonly at: (moment: Date, action: () => void) => Cancel;
  readonly log: Logger;
}

function earliest(first: number | null, second: number | null): number | null {
  if (first === null || second === null) {
    return first ?? second;
  }
  return Math.min(first, second);
}

function startsLink(before: BrushLinkPhase, after: BrushLinkPhase): boolean {
  return before !== after && (after === 'connecting' || after === 'linked');
}

export class BrushIngest {
  private readonly sessions: BrushingLog;
  private readonly deadlines = new Map<string, Cancel>();

  constructor(private readonly deps: IngestDeps) {
    this.sessions = new BrushingLog({
      ...deps,
      changed: (deviceId): void => {
        deps.fleet.known(deviceId)?.sessionsChanged();
      },
    });
  }

  stop(): void {
    this.deadlines.forEach((cancel) => {
      cancel();
    });
    this.deadlines.clear();
  }

  process(
    device: DeviceRow,
    client: Pick<ClientRow, 'id'>,
    batch: BrushFrameBatch,
  ): BrushBatchResult {
    const state = this.deps.fleet.of(device);
    const now = this.deps.now().toISOString();
    const before = state.link.phase;
    state.setLink(batch.link, now);
    state.note(batch.frames);
    this.noteLinkStart(state, before, batch.link.phase, now);
    const outcome = state.runtime.ingest(batch.frames, batch.adverts ?? []);
    if (before !== batch.link.phase) {
      this.linkChanged(state, outcome, batch.link.phase, now);
    }
    this.apply(device, state, outcome, now);
    this.arm(device, state);
    this.deps.log.debug('toothbrush.batch_ingested', () => ({
      device: device.id,
      client: client.id,
      frames: batch.frames.length,
      activity: state.runtime.state.activity,
    }));
    return {
      live: this.deps.live.watched(device.id),
      accepted: batch.frames.length,
      ...state.runtime.brand.fetch({
        state,
        stored: () => new Set(this.deps.store.brushingSessions.handleIds(device.id)),
        nowMs: Date.parse(now),
      }),
    };
  }

  private noteLinkStart(
    state: DeviceState,
    before: BrushLinkPhase,
    after: BrushLinkPhase,
    now: string,
  ): void {
    if (startsLink(before, after)) {
      state.runtime.linkStarted();
    }
    if (state.linkStartedAtMs === null || (after === 'linked' && before !== 'linked')) {
      state.markLinkStart(Date.parse(now));
    }
  }

  private arm(device: DeviceRow, state: DeviceState): void {
    this.deadlines.get(device.id)?.();
    this.deadlines.delete(device.id);
    const due = earliest(state.runtime.machine.deadlineMs, state.runtime.silenceDueMs);
    if (due === null) {
      return;
    }
    this.deadlines.set(
      device.id,
      this.deps.at(new Date(due), () => {
        this.expire(device, state);
      }),
    );
  }

  private expire(device: DeviceRow, state: DeviceState): void {
    this.deadlines.delete(device.id);
    const now = this.deps.now().toISOString();
    this.apply(device, state, state.runtime.expire(now), now);
    this.arm(device, state);
  }

  private linkChanged(
    state: DeviceState,
    outcome: BatchOutcome,
    phase: BrushLinkPhase,
    now: string,
  ): void {
    if (phase === 'linked') {
      state.linkRestored();
    } else {
      state.linkDropped();
    }
    outcome.absorb(state.runtime.linkChanged(phase, now));
  }

  private apply(device: DeviceRow, state: DeviceState, outcome: BatchOutcome, now: string): void {
    this.logOddities(device, outcome);
    for (const event of outcome.events) {
      this.handle(device, state, event);
    }
    for (const found of outcome.records) {
      this.record(device, state, found);
    }
    outcome.ended.forEach((id) => {
      state.fetching.delete(id);
      state.unavailable.add(id);
    });
    this.head(device, state, outcome, now);
    this.faults(device, state, outcome, now);
    this.deps.publisher.snapshot(state, outcome.touched, now);
    this.deps.publisher.link(state, now);
    this.observe(device, state, outcome, now);
    this.publishLive(device, state, now);
  }

  private personOf(state: DeviceState): string | null {
    return entrySettingsOf(state.entry).personId;
  }

  private contextOf(device: DeviceRow, state: DeviceState): LogContext {
    return {
      deviceId: device.id,
      personId: this.personOf(state),
      profile: state.runtime.profile,
      rules: state.runtime.definition.rules,
    };
  }

  private handle(device: DeviceRow, state: DeviceState, event: MachineEvent): void {
    if (event.kind !== 'finished') {
      return;
    }
    const logged = this.sessions.observed(this.contextOf(device, state), event.session);
    this.finished(state, logged, event.at);
  }

  private record(device: DeviceRow, state: DeviceState, found: Found): void {
    state.fetching.delete(found.sessionId);
    const draft = found.draft(this.deps.now());
    if (draft === null) {
      this.deps.log.warn('toothbrush.record_undated', {
        device: device.id,
        session: found.sessionId,
      });
      return;
    }
    if (!worthKeeping(draft.durationS)) {
      state.unavailable.add(found.sessionId);
      return;
    }
    this.finished(state, this.sessions.retained(this.contextOf(device, state), draft), found.at);
  }

  private finished(state: DeviceState, logged: Logged, at: string): void {
    const { session } = logged;
    const endedMs = Date.parse(session.startedAt) + session.durationS * 1000;
    const since = (state.linkStartedAtMs ?? 0) - RECENT_SESSION_MS;
    if (!logged.created || endedMs < since || !this.admit(state, at)) {
      return;
    }
    this.emit(state, {
      kind: 'activity',
      at: session.startedAt,
      details: this.summary(session),
      occurrence: `brushing:${session.id}`,
    });
  }

  private summary(session: BrushingSession): Record<string, JsonValue> {
    const person =
      session.personId === null ? null : this.deps.store.profiles.byId(session.personId).name;
    return {
      brushing: 'finished',
      complete: session.complete,
      person,
      mode: session.mode,
      durationS: Math.round(session.durationS),
    };
  }

  private admit(state: DeviceState, at: string): boolean {
    return admitEvent(state, Date.parse(at), this.deps.log);
  }

  private emit(state: DeviceState, spec: EventSpec): void {
    this.deps.sink().event(eventOf(state, spec));
  }

  private head(device: DeviceRow, state: DeviceState, outcome: BatchOutcome, now: string): void {
    const { head } = state.runtime.state;
    if (!outcome.touched.has('head') || typeof head.serial !== 'string' || head.usageS === null) {
      return;
    }
    const limitS = head.limitS ?? SONICARE_HEAD_LIFETIME_SECONDS;
    this.deps.store.brushingSessions.saveHead(device.id, {
      serial: head.serial,
      type: head.type,
      at: now,
      usageS: head.usageS,
      limitS,
    });
    this.wear(state, head.serial, wearPercentOf(head.usageS, limitS), now);
  }

  private wear(state: DeviceState, serial: string, wear: number, now: string): void {
    const { alerts } = entrySettingsOf(state.entry);
    const levels = [
      ['warn', alerts.headWarnPercent],
      ['due', alerts.headDuePercent],
    ] as const;
    for (const [level, threshold] of levels) {
      const key = `${serial}:${level}`;
      if (wear >= threshold && !state.notifiedHeadLevels.has(key)) {
        state.notifiedHeadLevels.add(key);
        this.emit(state, {
          kind: 'maintenance',
          at: now,
          details: { brushHead: level, wearPercent: wear },
          occurrence: `head:${key}`,
        });
      }
    }
  }

  private faults(device: DeviceRow, state: DeviceState, outcome: BatchOutcome, now: string): void {
    const { faults } = state.runtime.state;
    if (!outcome.touched.has('errors') || faults === null) {
      return;
    }
    if (state.faultBaseline === null) {
      state.setFaultBaseline([...faults]);
      background(
        this.deps.local.observe(state.entry.externalId, { faultBaseline: [...faults] }),
        'toothbrush.observe_failed',
        { device: device.id },
      );
      return;
    }
    const base = state.faultBaseline;
    const faulty = faults.some((reading, index) => base[index] !== reading);
    this.deps.publisher.fault(state, faulty, now);
    if (faulty) {
      const hex = faults.map((reading) => (reading ?? 0).toString(16)).join(':');
      this.emit(state, {
        kind: 'fault',
        at: now,
        details: { brushFault: hex },
        occurrence: `fault:${hex}`,
      });
    }
  }

  private observe(device: DeviceRow, state: DeviceState, outcome: BatchOutcome, now: string): void {
    const changed =
      outcome.touched.has('extras') ||
      outcome.touched.has('head') ||
      outcome.touched.has('storage') ||
      state.sent.get('observed:phase') !== state.link.phase;
    if (!changed) {
      return;
    }
    state.sent.set('observed:phase', state.link.phase);
    background(
      this.deps.local.observe(state.entry.externalId, {
        linkPhase: state.link.phase,
        linkRssi: state.link.rssi,
        linkDetail: state.link.detail,
        lastHeardAt: now,
        fetching: state.fetching.size,
        ...state.runtime.brand.observed(),
      }),
      'toothbrush.observe_failed',
      { device: device.id },
    );
  }

  private logOddities(device: DeviceRow, outcome: BatchOutcome): void {
    const { log } = this.deps;
    for (const item of outcome.unreadable) {
      log.warn('toothbrush.frame_unreadable', {
        device: device.id,
        characteristic: item.characteristic,
        hex: item.hex,
        reason: item.reason,
      });
    }
    for (const item of outcome.refused) {
      log.warn('toothbrush.link_refused', { device: device.id, status: item.status });
    }
  }

  private publishLive(device: DeviceRow, state: DeviceState, now: string): void {
    if (!this.deps.live.watched(device.id)) {
      return;
    }
    const person = this.personOf(state);
    this.deps.live.publish(device.id, (client) => {
      const profileId = this.deps.store.profiles.activeOf(client.id).id;
      return noticeOf(
        device,
        liveFrameOf(state, now, ownsSessions({ role: client.role, profileId }, person)),
      );
    });
  }
}
