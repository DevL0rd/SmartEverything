import {
  CAPABILITY_CATALOGUE,
  CommandRefusedError,
  type DeviceCapability,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
import {
  TV_APP_NAMES,
  TV_INPUT_SOURCES,
  TV_KEYS,
  tvAppNamed,
  type TvApp,
  type TvKey,
} from './catalogue';

export interface TvIdentity {
  readonly host: string;
  readonly macAddress: string;
  readonly name: string;
  readonly model: string;
  readonly frame: boolean;
}

export type TvAction =
  | { readonly kind: 'power'; readonly on: boolean }
  | { readonly kind: 'key'; readonly key: TvKey }
  | { readonly kind: 'launch'; readonly app: TvApp }
  | { readonly kind: 'art_mode'; readonly on: boolean };

const KEY_ACTIONS = {
  'raw:volume_up': 'KEY_VOLUP',
  'raw:volume_down': 'KEY_VOLDOWN',
  'raw:mute_toggle': 'KEY_MUTE',
} as const satisfies Record<string, TvKey>;

function action(key: keyof typeof KEY_ACTIONS, label: string): DeviceCapability {
  return { key, label, access: 'write', value: { kind: 'action' } };
}

export const TV_CAPABILITIES: readonly DeviceCapability[] = [
  {
    key: 'power',
    label: CAPABILITY_CATALOGUE.power.label,
    access: 'read_write',
    value: { kind: 'boolean' },
  },
  action('raw:volume_up', 'Volume up'),
  action('raw:volume_down', 'Volume down'),
  action('raw:mute_toggle', 'Mute or unmute'),
  {
    key: 'remote_key',
    label: CAPABILITY_CATALOGUE.remote_key.label,
    access: 'write',
    value: { kind: 'enum', options: [...TV_KEYS] },
  },
  {
    key: 'app_launch',
    label: CAPABILITY_CATALOGUE.app_launch.label,
    access: 'write',
    value: { kind: 'enum', options: [...TV_APP_NAMES] },
  },
  {
    key: 'input_source',
    label: CAPABILITY_CATALOGUE.input_source.label,
    access: 'write',
    value: { kind: 'enum', options: Object.keys(TV_INPUT_SOURCES) },
  },
];

export const ART_MODE_CAPABILITY: DeviceCapability = {
  key: 'art_mode',
  label: 'Art mode',
  access: 'read_write',
  value: { kind: 'boolean' },
};

export function tvCapabilities(frame: boolean): readonly DeviceCapability[] {
  return frame ? [...TV_CAPABILITIES, ART_MODE_CAPABILITY] : TV_CAPABILITIES;
}

export function tvDevice(identity: TvIdentity, online: boolean): DiscoveredDevice {
  return {
    provider: 'samsung_tv',
    externalId: identity.macAddress.toLowerCase(),
    parentExternalId: null,
    kind: 'television',
    name: identity.name,
    model: identity.model,
    manufacturer: 'Samsung',
    room: null,
    online,
    capabilities: [...tvCapabilities(identity.frame)],
    details: {
      host: identity.host,
      macAddress: identity.macAddress,
      powerStatePolling: true,
      frameTv: identity.frame,
    },
  };
}

function refuse(capability: string, reason: string): never {
  throw new CommandRefusedError(capability, reason);
}

function keyNamed(value: JsonValue): TvKey | undefined {
  return TV_KEYS.find((key) => key === value);
}

function inputKey(value: JsonValue): TvKey | undefined {
  const entry = Object.entries(TV_INPUT_SOURCES).find(([name]) => name === value);
  return entry?.[1];
}

type Resolver = (value: JsonValue) => TvAction;

function keyAction(capability: string, key: TvKey | undefined, reason: string): TvAction {
  return key === undefined ? refuse(capability, reason) : { kind: 'key', key };
}

function switchedOn(capability: string, value: JsonValue): boolean {
  return typeof value === 'boolean' ? value : refuse(capability, 'expected true or false');
}

function powerAction(value: JsonValue): TvAction {
  return { kind: 'power', on: switchedOn('power', value) };
}

function artModeAction(value: JsonValue): TvAction {
  return { kind: 'art_mode', on: switchedOn(ART_MODE_CAPABILITY.key, value) };
}

function fixedKey(key: TvKey): Resolver {
  return (): TvAction => ({ kind: 'key', key });
}

function launchAction(value: JsonValue): TvAction {
  const app = tvAppNamed(value);
  return app === undefined ? refuse('app_launch', 'not a known app') : { kind: 'launch', app };
}

const RESOLVERS: ReadonlyMap<string, Resolver> = new Map<string, Resolver>([
  ['power', powerAction],
  ['raw:volume_up', fixedKey(KEY_ACTIONS['raw:volume_up'])],
  ['raw:volume_down', fixedKey(KEY_ACTIONS['raw:volume_down'])],
  ['raw:mute_toggle', fixedKey(KEY_ACTIONS['raw:mute_toggle'])],
  [
    'remote_key',
    (value): TvAction => keyAction('remote_key', keyNamed(value), 'not a known remote key'),
  ],
  [
    'input_source',
    (value): TvAction => keyAction('input_source', inputKey(value), 'not a known input'),
  ],
  ['app_launch', launchAction],
  [ART_MODE_CAPABILITY.key, artModeAction],
]);

export function resolveTvCommand(capability: string, value: JsonValue, frame: boolean): TvAction {
  const offered = tvCapabilities(frame).some((entry) => entry.key === capability);
  const resolver = offered ? RESOLVERS.get(capability) : undefined;
  return resolver === undefined
    ? refuse(capability, 'the television does not have it')
    : resolver(value);
}
