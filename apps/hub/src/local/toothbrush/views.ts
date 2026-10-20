import {
  ApiError,
  DEFAULT_BRUSH_PAGE,
  brushGoalOf,
  computeBrushingStats,
  dailyFactsOf,
  todayOf,
  type BrushReadQuery,
  type BrushView,
  type BrushingSession,
  type DeviceRow,
} from '@smarteverything/domain';
import { ownsSessions, type Viewer } from './access';
import { entryProfileOf, entrySettingsOf } from './config';
import type { DeviceState, StateFigures } from './fleet';
import { liveFrameOf } from './live';
import { diagnosticsView } from './views-diagnostics';
import {
  batteryView,
  batteryViewOf,
  handleView,
  handleViewOf,
  headTimeline,
  headViewOf,
} from './views-care';
import { nameOf, ownerOnly, type ViewDeps } from './view-deps';

export { type ViewDeps } from './view-deps';

type StateView = Extract<BrushView, { readonly view: 'state' }>;

function linkOf(
  deps: ViewDeps,
  device: DeviceRow,
  state: DeviceState,
  viewer: Viewer,
): StateView['link'] {
  const holder = deps.holder(device);
  return {
    phase: state.link.phase,
    holderName: holder?.clientName ?? null,
    holderIsYou: holder?.clientId === viewer.clientId,
    rssi: state.link.rssi,
    lastHeardAt: state.link.heardAt,
    detail: state.link.detail,
    fetching: state.fetching.size,
  };
}

function visible(sessions: readonly BrushingSession[], viewer: Viewer): BrushingSession[] {
  return viewer.role === 'owner'
    ? [...sessions]
    : sessions.filter((session) => session.personId === viewer.profileId);
}

function figuresOf(
  deps: ViewDeps,
  device: DeviceRow,
  state: DeviceState,
  day: string,
): StateFigures {
  const settings = entrySettingsOf(state.entry);
  const goal = brushGoalOf(settings, settings.personId);
  return state.figures.get(`${settings.personId ?? ''}|${day}|${JSON.stringify(goal)}`, () => {
    const sessions = deps.store.brushingSessions.all(device.id, settings.personId ?? undefined);
    const facts = dailyFactsOf(sessions, goal, day);
    const stats = computeBrushingStats({ sessions, goal, range: 'week', anchor: day, today: day });
    return {
      today: facts.today,
      streak: facts.streak.current,
      score: stats.consistency.score,
      lastSession: sessions.at(-1) ?? null,
    };
  });
}

const NO_FIGURES: StateFigures = { today: null, streak: null, score: null, lastSession: null };

function stateView(deps: ViewDeps, device: DeviceRow, viewer: Viewer): BrushView {
  const state = deps.fleet.of(device);
  const settings = entrySettingsOf(state.entry);
  const profile = entryProfileOf(state.entry);
  const { definition } = state.runtime;
  const mine = ownsSessions(viewer, settings.personId);
  const now = deps.now();
  const day = deps.clock.dayOf(now, brushGoalOf(settings, settings.personId).eveningToHour);
  return {
    view: 'state',
    deviceId: device.id,
    model: definition.modelOf(state.entry),
    family: profile.brand === 'sonicare' ? profile.family : null,
    profile,
    availableModes: [...definition.modes(state.entry)],
    link: linkOf(deps, device, state, viewer),
    frame: liveFrameOf(state, now.toISOString(), mine),
    head: headViewOf(deps, device, state),
    battery: batteryViewOf(deps, device, state),
    handle: handleViewOf(deps, device, state),
    personId: settings.personId,
    personName: nameOf(deps, settings.personId),
    mine,
    ...(mine ? figuresOf(deps, device, state, day) : NO_FIGURES),
    writes: definition.writes(state),
    mayConfigure: viewer.role === 'owner',
  };
}

function sessionsView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
  query: BrushReadQuery,
): BrushView {
  const limit = query.limit ?? DEFAULT_BRUSH_PAGE;
  const page = deps.store.brushingSessions.page({
    deviceId: device.id,
    personId: viewer.role === 'owner' ? undefined : viewer.profileId,
    before: query.before,
    limit: limit + 1,
  });
  return {
    view: 'sessions',
    sessions: page.slice(0, limit),
    more: page.length > limit,
    hidden:
      viewer.role === 'owner'
        ? 0
        : deps.store.brushingSessions.countHidden(device.id, viewer.profileId),
  };
}

function sessionView(deps: ViewDeps, viewer: Viewer, query: BrushReadQuery): BrushView {
  if (query.sessionId === undefined) {
    throw new ApiError('invalid_request', 'Reading one session needs sessionId.');
  }
  const session = deps.store.brushingSessions.byId(query.sessionId);
  if (viewer.role !== 'owner' && session.personId !== viewer.profileId) {
    throw new ApiError('forbidden', 'This session belongs to another person.');
  }
  return { view: 'session', session, personName: nameOf(deps, session.personId) };
}

function personOf(viewer: Viewer, query: BrushReadQuery, brushPerson: string | null): string {
  if (query.personId !== undefined && query.personId !== viewer.profileId) {
    ownerOnly(viewer, 'read another person’s brushing');
    return query.personId;
  }
  return viewer.role === 'owner'
    ? (query.personId ?? brushPerson ?? viewer.profileId)
    : viewer.profileId;
}

function statsView(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
  query: BrushReadQuery,
): BrushView {
  const state = deps.fleet.of(device);
  const settings = entrySettingsOf(state.entry);
  const personId = personOf(viewer, query, settings.personId);
  const goal = brushGoalOf(settings, personId);
  const today = deps.clock.dayOf(deps.now(), goal.eveningToHour);
  const range = query.range ?? 'week';
  const anchor = query.anchor ?? today;
  const figures = state.statistics.get(
    `${personId}|${range}|${anchor}|${today}|${JSON.stringify(goal)}`,
    () => {
      const sessions = deps.store.brushingSessions.all(device.id, personId);
      return {
        stats: computeBrushingStats({ sessions, goal, range, anchor, today }),
        today: todayOf(sessions, goal, today),
      };
    },
  );
  return { view: 'stats', personId, personName: nameOf(deps, personId), ...figures };
}

function settingsView(deps: ViewDeps, device: DeviceRow, viewer: Viewer): BrushView {
  const state = deps.fleet.of(device);
  const settings = entrySettingsOf(state.entry);
  const personId = viewer.role === 'owner' ? settings.personId : viewer.profileId;
  return {
    view: 'settings',
    settings: viewer.role === 'owner' ? settings : null,
    goal: brushGoalOf(settings, personId),
    personId,
    profile: entryProfileOf(state.entry),
    writes: state.runtime.definition.writes(state),
    mayConfigure: viewer.role === 'owner',
  };
}

export function readBrush(
  deps: ViewDeps,
  device: DeviceRow,
  viewer: Viewer,
  query: BrushReadQuery,
): BrushView {
  const state = deps.fleet.of(device);
  switch (query.view) {
    case 'state':
      return stateView(deps, device, viewer);
    case 'sessions':
      return sessionsView(deps, device, viewer, query);
    case 'session':
      return sessionView(deps, viewer, query);
    case 'stats':
      return statsView(deps, device, viewer, query);
    case 'head':
      return headTimeline(deps, device, state);
    case 'battery':
      return batteryView(deps, device, state);
    case 'handle':
      return handleView(
        deps,
        device,
        state,
        visible(deps.store.brushingSessions.all(device.id, undefined), viewer),
      );
    case 'settings':
      return settingsView(deps, device, viewer);
    case 'diagnostics':
      ownerOnly(viewer, 'read the toothbrush diagnostics');
      return diagnosticsView(deps, device, state, viewer);
  }
}
