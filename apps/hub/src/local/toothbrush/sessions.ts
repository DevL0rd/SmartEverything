import { randomUUID } from 'node:crypto';
import {
  zoneSeconds,
  type BrushMode,
  type SessionDetails,
  type SessionPressure,
  type BrushProfile,
  type BrushSessionRules,
  type BrushingSession,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { RetainedDraft } from './brand';
import type { HomeClock } from './clock';
import type { ObservedSession } from './session-machine';

export interface LogDeps {
  readonly store: Store;
  readonly clock: HomeClock;
  readonly log: Logger;
  readonly changed: (deviceId: string) => void;
}

export interface Logged {
  readonly session: BrushingSession;
  readonly created: boolean;
}

export interface LogContext {
  readonly deviceId: string;
  readonly personId: string | null;
  readonly profile: BrushProfile;
  readonly rules: BrushSessionRules;
}

function zonesOf(
  profile: BrushProfile,
  mode: BrushMode | null,
  durationS: number,
  routineS: number,
): number[] {
  return mode === null ? [] : [...zoneSeconds(mode, profile.zones, durationS, routineS)];
}

function retainedZones(
  context: LogContext,
  draft: RetainedDraft,
  existing: BrushingSession | undefined,
): number[] {
  if (draft.zones !== null) {
    return [...draft.zones];
  }
  if (context.profile.zoneSource === 'pacer') {
    return [...(existing?.zones ?? [])];
  }
  return zonesOf(context.profile, draft.mode, draft.durationS, draft.routineS);
}

function retainedDetails(
  draft: RetainedDraft,
  existing: BrushingSession | undefined,
): SessionDetails | null {
  if (draft.details === null) {
    return existing?.details ?? null;
  }
  return { ...draft.details, face: draft.details.face ?? existing?.details?.face ?? null };
}

function retainedPressure(
  draft: RetainedDraft,
  existing: BrushingSession | undefined,
): SessionPressure | null {
  if (draft.pressure === null) {
    return existing?.pressure ?? null;
  }
  return { strip: [...(existing?.pressure?.strip ?? [])], ...draft.pressure };
}

function inherited(
  context: LogContext,
  draft: RetainedDraft,
  existing: BrushingSession | undefined,
): Pick<BrushingSession, 'id' | 'deviceId' | 'personId' | 'pressure' | 'headSerial'> {
  return {
    id: existing?.id ?? randomUUID(),
    deviceId: context.deviceId,
    personId: existing?.personId ?? context.personId,
    pressure: retainedPressure(draft, existing),
    headSerial: existing?.headSerial ?? draft.headSerial,
  };
}

export class BrushingLog {
  constructor(private readonly deps: LogDeps) {}

  observed(context: LogContext, session: ObservedSession): Logged {
    const { store, clock } = this.deps;
    const existing = this.existing(context, session.handleSessionId, session.startedAt);
    if (existing !== undefined) {
      const kept =
        existing.pressure === null && session.pressure !== null
          ? { ...existing, pressure: session.pressure }
          : existing;
      if (kept !== existing) {
        store.brushingSessions.update(kept);
        this.deps.changed(context.deviceId);
      }
      return { session: kept, created: false };
    }
    const made: BrushingSession = {
      id: randomUUID(),
      deviceId: context.deviceId,
      personId: context.personId,
      handleSessionId: session.handleSessionId,
      startedAt: session.startedAt,
      zoneOffsetSeconds: clock.offsetOf(new Date(session.startedAt)),
      durationS: session.durationS,
      routineS: session.routineS,
      mode: session.mode,
      intensity: session.intensity,
      source: 'observed',
      complete: session.complete,
      pressure: session.pressure,
      zones: [
        ...(session.zones ??
          zonesOf(context.profile, session.mode, session.durationS, session.routineS)),
      ],
      headSerial: session.headSerial,
      details: session.details,
    };
    store.brushingSessions.add(made);
    this.deps.changed(context.deviceId);
    return { session: made, created: true };
  }

  retained(context: LogContext, draft: RetainedDraft): Logged {
    const { store } = this.deps;
    const existing = this.existing(context, draft.handleSessionId, draft.startedAt);
    const made = this.retainedSession(context, draft, existing);
    if (existing === undefined) {
      store.brushingSessions.add(made);
    } else {
      store.brushingSessions.update(made);
    }
    this.deps.changed(context.deviceId);
    return { session: made, created: existing === undefined };
  }

  private retainedSession(
    context: LogContext,
    draft: RetainedDraft,
    existing: BrushingSession | undefined,
  ): BrushingSession {
    return {
      ...inherited(context, draft, existing),
      handleSessionId: draft.handleSessionId,
      startedAt: draft.startedAt,
      zoneOffsetSeconds: this.deps.clock.offsetOf(new Date(draft.startedAt)),
      durationS: draft.durationS,
      routineS: draft.routineS,
      mode: draft.mode,
      intensity: draft.intensity,
      source: 'retained',
      complete: draft.complete,
      zones: retainedZones(context, draft, existing),
      details: retainedDetails(draft, existing),
    };
  }

  private existing(
    context: LogContext,
    handleSessionId: number | null,
    startedAt: string,
  ): BrushingSession | undefined {
    const { brushingSessions } = this.deps.store;
    const byId =
      handleSessionId === null
        ? undefined
        : brushingSessions.findByHandleId(context.deviceId, handleSessionId);
    const sameDay =
      byId !== undefined &&
      Math.abs(Date.parse(byId.startedAt) - Date.parse(startedAt)) < 6 * 3600 * 1000;
    return sameDay
      ? byId
      : brushingSessions.near(context.deviceId, startedAt, context.rules.mergeWindowS);
  }
}
