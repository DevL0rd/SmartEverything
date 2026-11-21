import { faultOf } from '@smarteverything/ble';
import {
  ApiError,
  BELT_STEP_KMH,
  MAX_BELT_KMH,
  MIN_BELT_KMH,
  computeStats,
  goalsOf,
  metOf,
  paceSecondsPerKm,
  periodTotals,
  remoteStartVerdict,
  zoneOffsetSeconds,
  type BeltLinkPhase,
  type DeviceRow,
  type MetricSeries,
  type SessionDetail,
  type SessionSample,
  type SessionSegment,
  type TreadmillReadQuery,
  type TreadmillIdentity,
  type TreadmillSession,
  type TreadmillSettings,
  type TreadmillView,
  type WatchBridge,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { entryConfigOf, entrySettingsOf } from './config';
import type { SessionDetailRead } from './session-units';
import type { DeviceState, Fleet, WalkerNow } from './fleet';
import { liveFrameOf, mayShowBody, type FrameFacts } from './live';

type StateView = Extract<TreadmillView, { readonly view: 'state' }>;

const RECENT_SECONDS = 300;

const PROFILE_POINTS = 600;

const DAY_MS = 86_400_000;

export interface Viewer {
  readonly clientId: string;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
}

export interface ViewDeps {
  readonly store: Pick<Store, 'host' | 'live'>;
  readonly fleet: Fleet;
  readonly holder: (device: DeviceRow) => WatchBridge | null;
  readonly walkerOf: (device: DeviceRow) => Promise<WalkerNow>;
  readonly series: (deviceId: string, capability: string) => MetricSeries;
  readonly now: () => Date;
}

function visibleTo(viewer: Viewer, session: Pick<TreadmillSession, 'walkerProfileId'>): boolean {
  return viewer.role === 'owner' || session.walkerProfileId === viewer.profileId;
}

function localDay(deps: ViewDeps, at: Date): string {
  const offset = zoneOffsetSeconds(deps.store.live.home.settings.read().time_zone, at);
  return new Date(at.getTime() + offset * 1000).toISOString().slice(0, 10);
}

const STANDBY_OR_OFF = 'Standby or switched off';

const SILENT_PHASES: readonly BeltLinkPhase[] = ['not_linked', 'searching', 'lost'];

function linkDetailOf(state: DeviceState): string | null {
  const stopped =
    state.runtime.machine.state === 'idle' || state.runtime.machine.state === 'stopped';
  return SILENT_PHASES.includes(state.link.phase) && stopped ? STANDBY_OR_OFF : state.link.detail;
}

interface Seen {
  readonly device: DeviceRow;
  readonly state: DeviceState;
  readonly walker: WalkerNow;
  readonly viewer: Viewer;
}

function linkOf(deps: ViewDeps, seen: Seen): StateView['link'] {
  const { device, state, walker, viewer } = seen;
  const holder = deps.holder(device);
  return {
    phase: state.link.phase,
    holderName: holder?.clientName ?? null,
    holderIsYou: holder?.clientId === viewer.clientId,
    rssi: state.link.rssi,
    reconnects: state.link.reconnects,
    lastHeardAt: state.link.heardAt,
    detail: linkDetailOf(state),
    walkerProfileId: walker.profileId,
    walkerName: walker.name,
  };
}

function inclineLimitsOf(
  identity: TreadmillIdentity,
  settings: TreadmillSettings,
): StateView['limits']['incline'] {
  const { inclineMinPercent: min, inclineMaxPercent: max, inclineStepPercent: step } = identity;
  if (min === null || max === null || step === null) {
    return null;
  }
  return {
    min,
    max,
    step,
    remoteMax: settings.policy.remoteIncline ? settings.policy.remoteInclineMax : null,
  };
}

function maintenanceBase(state: DeviceState): string {
  const since = entrySettingsOf(state.entry).lubricatedAt;
  return since ?? state.entry.createdAt;
}

function maintenanceOf(
  deps: ViewDeps,
  state: DeviceState,
  distanceM: number,
): StateView['maintenance'] {
  const settings = entrySettingsOf(state.entry);
  const due = Date.parse(maintenanceBase(state)) + settings.lubricationDays * DAY_MS;
  return {
    lubricatedAt: settings.lubricatedAt,
    dueInDays: Math.ceil((due - deps.now().getTime()) / DAY_MS),
    beltKmSince: distanceM / 1000,
  };
}

function startOf(deps: ViewDeps, seen: Seen): StateView['start'] {
  const { device, state, walker, viewer } = seen;
  const holder = deps.holder(device);
  const verdict = remoteStartVerdict(entrySettingsOf(state.entry).policy, {
    owner: viewer.role === 'owner',
    walker: walker.profileId === viewer.profileId,
    remote: holder?.clientId !== viewer.clientId,
  });
  return { allowed: verdict.allowed, reason: verdict.allowed ? null : verdict.reason };
}

function recentSpeed(deps: ViewDeps, deviceId: string): StateView['recentSpeed'] {
  const from = deps.now().getTime() - RECENT_SECONDS * 1000;
  return deps
    .series(deviceId, 'belt_speed')
    .points.filter((point) => Date.parse(point.at) >= from)
    .map((point) => ({ at: point.at, kmh: point.value }));
}

function limitsOf(state: DeviceState): StateView['limits'] {
  const { identity } = state.runtime;
  const settings = entrySettingsOf(state.entry);
  return {
    minKmh: identity.speedMinKmh ?? MIN_BELT_KMH,
    maxKmh: identity.speedMaxKmh ?? MAX_BELT_KMH,
    stepKmh: identity.speedStepKmh ?? BELT_STEP_KMH,
    capKmh: state.runtime.pad.maxSpeedKmh ?? null,
    remoteCapKmh: settings.policy.remoteStart ? settings.policy.remoteMaxKmh : null,
    incline: inclineLimitsOf(identity, settings),
  };
}

async function stateView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
): Promise<TreadmillView> {
  const state = deps.fleet.of(device);
  const config = entryConfigOf(state.entry);
  const settings = entrySettingsOf(state.entry);
  const [walker, stored] = await Promise.all([
    deps.walkerOf(device),
    deps.store.host.read('treadmillMaintenance', {
      deviceId: device.id,
      since: maintenanceBase(state),
      walker: viewer.role === 'owner' ? undefined : viewer.profileId,
    }),
  ]);
  const now = deps.now();
  const seen: Seen = { device, state, walker, viewer };
  const bodyVisible = mayShowBody({ role: viewer.role }, viewer.profileId, walker.profileId);
  const facts: FrameFacts = {
    state,
    at: now.toISOString(),
    walker,
    heartRate: bodyVisible ? walker.heartRate : null,
    scale: settings.inclineScale,
  };
  return {
    view: 'state',
    deviceId: device.id,
    family: config.family,
    model: config.model,
    link: linkOf(deps, seen),
    frame: liveFrameOf(facts, bodyVisible),
    recentSpeed: recentSpeed(deps, device.id),
    limits: limitsOf(state),
    inclineScale: settings.inclineScale,
    pad: state.runtime.pad,
    fault: state.runtime.fault === null ? null : faultOf(state.runtime.fault, config.family),
    lastSession: stored.lastSession,
    start: startOf(deps, seen),
    mayConfigure: viewer.role === 'owner',
    bodyVisible,
    maintenance: maintenanceOf(deps, state, stored.distanceM),
  };
}

function personFor(viewer: Viewer, personId: string | undefined): string {
  if (personId === undefined || personId === viewer.profileId) {
    return viewer.profileId;
  }
  if (viewer.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the owner reads another person’s treadmill sessions.');
  }
  return personId;
}

async function sessionsView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
  query: TreadmillReadQuery,
): Promise<TreadmillView> {
  const limit = query.limit ?? 50;
  const walker =
    viewer.role === 'owner' && query.personId === undefined
      ? undefined
      : personFor(viewer, query.personId);
  const rows = await deps.store.host.call('treadmillSessions', 'page', {
    deviceId: device.id,
    walkerProfileId: walker,
    before: query.before,
    limit: limit + 1,
  });
  return { view: 'sessions', sessions: rows.slice(0, limit), more: rows.length > limit };
}

function downsample(samples: readonly SessionSample[]): SessionSample[] {
  const step = Math.max(1, Math.ceil(samples.length / PROFILE_POINTS));
  return samples.filter((_, index) => index % step === 0);
}

function segmentsOf(samples: readonly SessionSample[]): SessionSegment[] {
  const segments: SessionSegment[] = [];
  let from = 0;
  let total = 0;
  let count = 0;
  samples.forEach((sample, index) => {
    total += sample.kmh;
    count += 1;
    const next = samples[index + 1];
    if (next?.state !== sample.state) {
      segments.push({ fromS: from, toS: sample.t, avgKmh: total / count, state: sample.state });
      from = next?.t ?? sample.t;
      total = 0;
      count = 0;
    }
  });
  return segments;
}

function detailOf(read: SessionDetailRead): SessionDetail {
  const { session, samples, weightKg: weight } = read;
  const minutes = session.activeSeconds / 60;
  return {
    session,
    profile: downsample(samples),
    segments: segmentsOf(samples),
    cadence: session.steps !== null && minutes > 0 ? session.steps / minutes : null,
    strideM: session.steps !== null && session.steps > 0 ? session.distanceM / session.steps : null,
    met:
      session.kcal !== null && weight !== null
        ? metOf(session.kcal, weight, session.activeSeconds)
        : null,
    paceSecondsPerKm: paceSecondsPerKm(session.avgKmh),
  };
}

async function sessionView(
  deps: ViewDeps,
  viewer: Viewer,
  query: TreadmillReadQuery,
): Promise<TreadmillView> {
  if (query.sessionId === undefined) {
    throw new ApiError('invalid_request', 'Reading a session needs its sessionId.');
  }
  const read = await deps.store.host.read('treadmillSessionDetail', query.sessionId);
  if (!visibleTo(viewer, read.session)) {
    throw new ApiError('forbidden', 'This session belongs to another person.');
  }
  return { view: 'session', detail: detailOf(read), walkerName: read.walkerName };
}

async function statsView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
  query: TreadmillReadQuery,
): Promise<TreadmillView> {
  const profileId = personFor(viewer, query.personId);
  const sessions = await deps.store.host.call(
    'treadmillSessions',
    'finished',
    device.id,
    profileId,
  );
  const today = localDay(deps, deps.now());
  const settings = entrySettingsOf(deps.fleet.of(device).entry);
  const stats = computeStats({
    sessions,
    range: query.range ?? 'week',
    anchor: query.anchor ?? today,
    today,
  });
  const day = periodTotals(sessions, 'day', today);
  const week = periodTotals(sessions, 'week', today);
  return {
    view: 'stats',
    profileId,
    stats,
    goals: goalsOf(settings, profileId),
    today: {
      activeSeconds: day.activeSeconds,
      distanceM: day.distanceM,
      steps: day.steps,
      kcal: day.kcal,
      sessions: day.sessions,
    },
    week: { distanceM: week.distanceM, sessions: week.sessions },
  };
}

async function settingsView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
): Promise<TreadmillView> {
  const state = deps.fleet.of(device);
  const owner = viewer.role === 'owner';
  const walker = await deps.walkerOf(device);
  return {
    view: 'settings',
    settings: owner ? entrySettingsOf(state.entry) : null,
    pad: owner ? state.runtime.pad : null,
    goals: goalsOf(entrySettingsOf(state.entry), viewer.profileId),
    walkerProfileId: walker.profileId,
    mayConfigure: owner,
  };
}

function recordsView(deps: ViewDeps, device: DeviceRow, viewer: Viewer): TreadmillView {
  if (viewer.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the owner reads the records stored on the treadmill.');
  }
  const state = deps.fleet.of(device);
  return { view: 'records', remaining: state.padRecordsRemaining, records: [...state.padRecords] };
}

async function diagnosticsView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
): Promise<TreadmillView> {
  if (viewer.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the owner reads the treadmill diagnostics.');
  }
  const state = deps.fleet.of(device);
  const config = entryConfigOf(state.entry);
  const walker = await deps.walkerOf(device);
  return {
    view: 'diagnostics',
    family: config.family,
    identity: state.runtime.identity,
    gatt: config.gatt,
    link: linkOf(deps, { device, state, walker, viewer }),
    latencyMs: state.latencyMs,
    lastError: state.lastError,
    padRecordsRemaining: state.padRecordsRemaining,
    rawLog: { enabled: state.rawLogging, frames: [...state.rawLog] },
  };
}

export async function readTreadmill(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
  query: TreadmillReadQuery,
): Promise<TreadmillView> {
  switch (query.view) {
    case 'state':
      return stateView(deps, device, viewer);
    case 'sessions':
      return sessionsView(deps, device, viewer, query);
    case 'session':
      return sessionView(deps, viewer, query);
    case 'stats':
      return statsView(deps, device, viewer, query);
    case 'records':
      return recordsView(deps, device, viewer);
    case 'settings':
      return settingsView(deps, device, viewer);
    case 'diagnostics':
      return diagnosticsView(deps, device, viewer);
  }
}
