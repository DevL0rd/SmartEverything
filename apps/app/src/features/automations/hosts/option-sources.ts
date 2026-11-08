import {
  DEVICE_FAMILIES,
  HEALTH_METRICS,
  MCP_TOOL_NAMES,
  PHONE_CONTEXT_STATES,
  SPEECH_VOICES,
  WEATHER_KINDS,
  type OptionSourceId,
} from '@smarteverything/domain';
import { DEVICE_RESOLVERS, computersOf, devicesOfTargets, roleRows } from './option-devices';
import { remoteNeedOf } from './option-remote';
import {
  named,
  plain,
  ready,
  searchRows,
  unavailable,
  type AutomationScope,
  type HomeData,
  type OptionContext,
  type OptionResult,
  type OptionRow,
  type RemoteNeed,
  type RemoteState,
} from './option-types';

const NEEDS_TARGET = 'Pick the device, room or group first';
const NEEDS_SCOPE = 'Needs the automation being edited';
const NEEDS_RECORD = 'Needs a wired list or record';

const ABSENT: Readonly<Partial<Record<OptionSourceId, string>>> = {
  'device.labels': 'Devices have no labels to list yet',
  'device.operations': 'The device operations have no list yet',
  'phone.sounds': 'Phone sounds have no list yet',
  'app.pages': 'App pages have no list yet',
  'laundry.programs': 'Needs the laundry node',
  'event.kinds': 'Needs the event source node',
  locales: 'Locales have no list yet',
};

function scopeRows(
  context: OptionContext,
  pick: (scope: AutomationScope) => readonly OptionRow[],
): OptionResult {
  return context.scope === undefined ? unavailable(NEEDS_SCOPE) : ready(pick(context.scope));
}

function fieldRows(context: OptionContext): OptionResult {
  return context.fields === undefined ? unavailable(NEEDS_RECORD) : ready(plain(context.fields));
}

function zoneRows(home: HomeData): OptionResult {
  if (home.timeZones === null) return unavailable('This device cannot list time zones');
  return ready(home.timeZones.map((zone) => ({ id: zone, label: zone.replaceAll('_', ' ') })));
}

function channelRows(home: HomeData): OptionResult {
  return home.channels.length === 0
    ? unavailable('There are no Talk channels yet; create one in Talk')
    : ready(named(home.channels));
}

function rolesOf(home: HomeData, context: OptionContext): OptionResult {
  const devices =
    context.target.length === 0 ? home.devices : devicesOfTargets(home, context.target);
  return ready(roleRows(devices));
}

function scopedDevices(home: HomeData, context: OptionContext): HomeData['devices'] | null {
  if (context.target.length > 0) return devicesOfTargets(home, context.target);
  return context.wholeHome === true ? home.devices : null;
}

type HomeResolver = (home: HomeData, context: OptionContext) => OptionResult;

const HOME_RESOLVERS: Partial<Record<OptionSourceId, HomeResolver>> = {
  rooms: (home) => ready(named(home.rooms)),
  groups: (home) => ready(named(home.groups)),
  scenes: (home) => ready(named(home.scenes)),
  people: (home) => ready(named(home.people)),
  computers: (home) => ready(computersOf(home.devices)),
  voices: () => ready(plain(SPEECH_VOICES)),
  'talk.channels': (home) => channelRows(home),
  automations: (home) => ready(named(home.automations)),
  chats: (home) => ready(home.chats.map((c) => ({ id: c.id, label: c.title }))),
  values: (home) => ready(home.values.map((v) => ({ id: v.id, label: v.content.name }))),
  tools: () => ready(plain(MCP_TOOL_NAMES)),
  'device.families': () => ready(plain(DEVICE_FAMILIES)),
  'device.roles': rolesOf,
  'health.metrics': () => ready(plain(HEALTH_METRICS)),
  'weather.conditions': () => ready(plain(WEATHER_KINDS)),
  'phone.contexts': () => ready(plain(PHONE_CONTEXT_STATES)),
  time_zones: (home) => zoneRows(home),
  variables: (_home, context) => scopeRows(context, (scope) => scope.variables),
  'triggers.this': (_home, context) => scopeRows(context, (scope) => scope.triggers),
  'timers.this': (_home, context) => scopeRows(context, (scope) => scope.timers),
  'events.emitted': (_home, context) => scopeRows(context, (scope) => scope.events),
  'record.fields': (_home, context) => fieldRows(context),
};

function localResult(
  source: OptionSourceId,
  context: OptionContext,
  home: HomeData,
): OptionResult | null {
  const homeResolver = HOME_RESOLVERS[source];
  if (homeResolver !== undefined) return homeResolver(home, context);
  const deviceResolver = DEVICE_RESOLVERS[source];
  if (deviceResolver === undefined) return null;
  const devices = scopedDevices(home, context);
  return devices === null ? unavailable(NEEDS_TARGET) : deviceResolver(devices, context);
}

function remoteResult(need: RemoteNeed, remote: RemoteState): OptionResult {
  if (need.kind === 'blocked') return unavailable(need.reason);
  if (remote.status === 'ready') return ready(remote.rows);
  if (remote.status === 'failed') return unavailable(remote.reason);
  return { status: 'loading' };
}

export function resolveOptions(
  source: OptionSourceId,
  context: OptionContext,
  home: HomeData,
  remote: RemoteState,
): OptionResult {
  const absent = ABSENT[source];
  if (absent !== undefined) return unavailable(absent);
  const result =
    localResult(source, context, home) ?? remoteResult(remoteNeedOf(source, context), remote);
  return result.status === 'ready' ? ready(searchRows(result.options, context.search)) : result;
}
