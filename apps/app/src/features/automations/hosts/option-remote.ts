import type { OptionSourceId } from '@smarteverything/domain';
import {
  humanise,
  textOf,
  type ClientFetchKind,
  type OptionContext,
  type OptionRow,
  type RemoteNeed,
  type SignalLevel,
} from './option-types';

const NONE: RemoteNeed = { kind: 'none' };

const UNLINKED_ROOM = 'Not linked to a room on this vacuum map; link it on the vacuum page';
const STALE_ROOM = 'Linked to a room that is no longer on this vacuum map';

function blocked(reason: string): RemoteNeed {
  return { kind: 'blocked', reason };
}

function clientId(context: OptionContext): string | null {
  const picked = textOf(context.values['computer']) || textOf(context.values['phone']);
  return picked !== '' ? picked : (context.target[0] ?? null);
}

function clientNeed(t: ClientFetchKind, noun: string): (context: OptionContext) => RemoteNeed {
  return (context) => {
    const deviceId = clientId(context);
    return deviceId === null
      ? blocked(`Pick the ${noun} first`)
      : { kind: 'fetch', fetch: { t, deviceId } };
  };
}

function vacuumNeed(context: OptionContext): RemoteNeed {
  const picked = textOf(context.values['vacuum']);
  const deviceId = picked !== '' ? picked : (context.target[0] ?? null);
  return deviceId === null
    ? blocked('Pick the vacuum first')
    : { kind: 'fetch', fetch: { t: 'vacuum_rooms', deviceId } };
}

function processesNeed(context: OptionContext): RemoteNeed {
  const deviceId = clientId(context);
  return deviceId === null
    ? blocked('Pick the computer first')
    : { kind: 'fetch', fetch: { t: 'processes', deviceId, search: context.search.trim() } };
}

function signalNeed(level: SignalLevel): (context: OptionContext) => RemoteNeed {
  return (context) => {
    const source = textOf(context.values['source']);
    const kind = textOf(context.values['kind']);
    if (level !== 'sources' && source === '') return blocked('Pick the source first');
    if ((level === 'subjects' || level === 'fields') && kind === '') {
      return blocked('Pick the kind of signal first');
    }
    return { kind: 'fetch', fetch: { t: 'signals', level, source, kind } };
  };
}

function buttonsNeed(context: OptionContext): RemoteNeed {
  const remoteId = textOf(context.values['remote']);
  if (remoteId === '') return blocked('Pick the remote first');
  return { kind: 'fetch', fetch: { t: 'ir_buttons', remoteId } };
}

function pluginNeed(context: OptionContext): RemoteNeed {
  if (context.plugin === undefined) return blocked('Needs the plugin that lists these');
  return { kind: 'fetch', fetch: { t: 'plugin', ...context.plugin, search: context.search } };
}

function modelsNeed(kind: 'chat' | 'image'): (context: OptionContext) => RemoteNeed {
  return (context) => ({ kind: 'fetch', fetch: { t: 'models', kind, search: context.search } });
}

type NeedOf = (context: OptionContext) => RemoteNeed;

const NEEDS: Partial<Record<OptionSourceId, NeedOf>> = {
  'ir.remotes': () => ({ kind: 'fetch', fetch: { t: 'ir_remotes' } }),
  'ir.buttons': buttonsNeed,
  'ir.appliances': () => ({ kind: 'fetch', fetch: { t: 'ir_appliances' } }),
  'signal.sources': signalNeed('sources'),
  'signal.kinds': signalNeed('kinds'),
  'signal.subjects': signalNeed('subjects'),
  'signal.fields': signalNeed('fields'),
  'speech.sources': () => ({ kind: 'fetch', fetch: { t: 'speech' } }),
  'listening.sources': () => ({ kind: 'fetch', fetch: { t: 'listening' } }),
  'computer.apps': clientNeed('computer_apps', 'computer'),
  'computer.audio_devices': clientNeed('audio_devices', 'computer'),
  'computer.audio_apps': clientNeed('audio_apps', 'computer'),
  'computer.displays': clientNeed('displays', 'computer'),
  'computer.services': clientNeed('services', 'computer'),
  'computer.keyboard_layouts': clientNeed('keyboard_layouts', 'computer'),
  'computer.startup_apps': clientNeed('startup_apps', 'computer'),
  'computer.networks': clientNeed('wifi_networks', 'computer'),
  'computer.bluetooth_devices': clientNeed('bluetooth_devices', 'computer'),
  'computer.processes': processesNeed,
  'phone.apps': clientNeed('phone_apps', 'phone'),
  'vacuum.rooms': vacuumNeed,
  'models.chat': modelsNeed('chat'),
  'models.image': modelsNeed('image'),
  'plugin.entity': pluginNeed,
};

export function remoteNeedOf(source: OptionSourceId, context: OptionContext): RemoteNeed {
  const need = NEEDS[source];
  return need === undefined ? NONE : need(context);
}

export interface IrRemoteLike {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly brand: string | null;
}

export function irRemoteRows(rows: readonly IrRemoteLike[]): readonly OptionRow[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.name,
    detail: row.brand === null ? row.category : `${row.brand} ${row.category}`,
  }));
}

export function irButtonRows(
  codes: readonly { readonly remote_id: string; readonly button: string }[],
  remoteId: string,
): readonly OptionRow[] {
  const buttons = new Set(codes.filter((c) => c.remote_id === remoteId).map((c) => c.button));
  return [...buttons].map((button) => ({ id: button, label: button }));
}

export function serviceRows(
  services: readonly { readonly unit: string; readonly description: string }[],
): readonly OptionRow[] {
  return services.map((service) => ({
    id: service.unit,
    label: service.unit,
    ...(service.description === '' ? {} : { detail: service.description }),
  }));
}

export function keyboardLayoutRows(
  layouts: readonly { readonly id: string; readonly name: string }[],
  current: string,
): readonly OptionRow[] {
  return layouts.map((layout) => ({
    id: layout.id,
    label: layout.name,
    ...(layout.id === current ? { detail: 'In use now' } : {}),
  }));
}

export function startupAppRows(
  entries: readonly {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
  }[],
): readonly OptionRow[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.name,
    detail: entry.enabled ? 'Starts at sign-in' : 'Does not start',
  }));
}

export function wifiNetworkRows(
  networks: readonly {
    readonly ssid: string;
    readonly known: boolean;
    readonly connected: boolean;
  }[],
): readonly OptionRow[] {
  return networks
    .filter((network) => network.known)
    .map((network) => ({
      id: network.ssid,
      label: network.ssid,
      ...(network.connected ? { detail: 'Connected now' } : {}),
    }));
}

export function bluetoothDeviceRows(
  devices: readonly { readonly id: string; readonly name: string; readonly connected: boolean }[],
): readonly OptionRow[] {
  return devices.map((device) => ({
    id: device.id,
    label: device.name,
    detail: device.connected ? 'Connected' : 'Not connected',
  }));
}

export function processRows(
  processes: readonly {
    readonly pid: number;
    readonly name: string;
    readonly user: string;
  }[],
): readonly OptionRow[] {
  return processes.map((process) => ({
    id: String(process.pid),
    label: process.name,
    detail: [process.user, String(process.pid)].join(' '),
  }));
}

export interface SignalSourceLike {
  readonly source: string;
  readonly label: string;
  readonly kinds: readonly {
    readonly kind: string;
    readonly label: string;
    readonly subject: string;
    readonly fields:
      | 'capabilities'
      | 'free'
      | readonly { readonly field: string; readonly label: string; readonly unit: string | null }[];
  }[];
}

export function signalRows(
  sources: readonly SignalSourceLike[],
  level: SignalLevel,
  source: string,
  kind: string,
): readonly OptionRow[] {
  if (level === 'sources') return sources.map((s) => ({ id: s.source, label: s.label }));
  const kinds = sources.find((s) => s.source === source)?.kinds ?? [];
  if (level === 'kinds') return kinds.map((k) => ({ id: k.kind, label: k.label }));
  const picked = kinds.find((k) => k.kind === kind);
  if (picked === undefined) return [];
  if (level === 'subjects') return [{ id: picked.subject, label: humanise(picked.subject) }];
  if (picked.fields === 'capabilities' || picked.fields === 'free') return [];
  return picked.fields.map((f) => ({
    id: f.field,
    label: f.label,
    ...(f.unit === null ? {} : { detail: f.unit }),
  }));
}

export function speechRows(
  sources: readonly { readonly source: { readonly kind: string }; readonly label: string }[],
): readonly OptionRow[] {
  return sources.map((entry) => ({
    id: JSON.stringify(entry.source),
    label: entry.label,
    detail: humanise(entry.source.kind),
  }));
}

export function listeningRows(
  sources: readonly { readonly key: string; readonly name: string; readonly kind: string }[],
): readonly OptionRow[] {
  return sources.map((s) => ({ id: s.key, label: s.name, detail: humanise(s.kind) }));
}

export function computerAppRows(
  installed: readonly { readonly id: string; readonly name: string }[],
): readonly OptionRow[] {
  return installed.map((app) => ({ id: app.id, label: app.name }));
}

export function audioDeviceRows(state: {
  readonly outputs: readonly { readonly id: string; readonly name: string }[];
  readonly inputs: readonly { readonly id: string; readonly name: string }[];
}): readonly OptionRow[] {
  return [
    ...state.outputs.map((d) => ({ id: d.id, label: d.name, detail: 'Output' })),
    ...state.inputs.map((d) => ({ id: d.id, label: d.name, detail: 'Input' })),
  ];
}

export function audioAppRows(
  apps: readonly { readonly streamId: string; readonly app: string }[],
): readonly OptionRow[] {
  return apps.map((app) => ({ id: app.streamId, label: app.app }));
}

export function displayRows(
  outputs: readonly { readonly id: string; readonly name: string }[],
): readonly OptionRow[] {
  return outputs.map((output) => ({ id: output.id, label: output.name }));
}

export function phoneAppRows(
  installed: readonly { readonly package: string; readonly label: string }[],
): readonly OptionRow[] {
  return installed.map((app) => ({ id: app.package, label: app.label, detail: app.package }));
}

export function modelRows(
  models: readonly { readonly id: string; readonly name: string; readonly author_name: string }[],
): readonly OptionRow[] {
  return models.map((model) => ({ id: model.id, label: model.name, detail: model.author_name }));
}

export function pluginRows(
  options: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string | null;
  }[],
): readonly OptionRow[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    ...(option.detail === null ? {} : { detail: option.detail }),
  }));
}

export function vacuumRoomRows(
  homeRooms: readonly {
    readonly id: string;
    readonly name: string;
    readonly usedBy: { readonly mapRoomName: string; readonly stale: boolean } | null;
  }[],
): readonly OptionRow[] {
  return homeRooms.map((room) => {
    if (room.usedBy === null) {
      return { id: room.id, label: room.name, unavailable: UNLINKED_ROOM };
    }
    if (room.usedBy.stale) {
      return { id: room.id, label: room.name, unavailable: STALE_ROOM };
    }
    return { id: room.id, label: room.name, detail: room.usedBy.mapRoomName };
  });
}
