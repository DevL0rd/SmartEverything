import {
  IR_AC_MODES,
  IR_SPEED_STEPS,
  IR_TEMP_RANGE,
  keyFor,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceKind,
  type IrRemoteState,
  type JsonValue,
} from '@smarteverything/domain';

export const IR_FAN_SPEEDS: readonly string[] = Array.from({ length: IR_SPEED_STEPS }, (_, step) =>
  String(step + 1),
);

const KINDS: Readonly<Record<string, DeviceKind>> = {
  'air conditioner': 'air_conditioner',
  fan: 'fan',
  light: 'light',
  audio: 'speaker',
  tv: 'television',
  projector: 'television',
  'set-top box': 'appliance',
};

export function applianceKindOf(category: string): DeviceKind {
  return KINDS[category.trim().toLowerCase()] ?? 'other';
}

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'write',
  value: { kind: 'boolean' },
};

const CLIMATE: readonly DeviceCapability[] = [
  POWER,
  {
    key: 'hvac_mode',
    label: 'Mode',
    access: 'write',
    value: { kind: 'enum', options: [...IR_AC_MODES] },
  },
  {
    key: 'target_temperature',
    label: 'Target temperature',
    access: 'write',
    value: { kind: 'number', min: IR_TEMP_RANGE.min, max: IR_TEMP_RANGE.max, step: 1, unit: '°C' },
  },
  {
    key: 'fan_mode',
    label: 'Fan speed',
    access: 'write',
    value: { kind: 'enum', options: [...IR_FAN_SPEEDS] },
  },
];

function keysCapability(keys: readonly string[]): DeviceCapability[] {
  return keys.length === 0
    ? []
    : [
        {
          key: 'remote_key',
          label: 'Remote button',
          access: 'write',
          value: { kind: 'enum', options: [...keys] },
        },
      ];
}

export function applianceCapabilities(
  kind: DeviceKind,
  keys: readonly string[],
): DeviceCapability[] {
  if (kind === 'air_conditioner') {
    return [...CLIMATE, ...keysCapability(keys)];
  }
  const power = keyFor(keys, 'power') === undefined ? [] : [POWER];
  return [...power, ...keysCapability(keys)];
}

export function stateValues(state: IrRemoteState): ReadonlyMap<CapabilityKey, JsonValue> {
  const values = new Map<CapabilityKey, JsonValue>();
  if (state.on !== null) values.set('power', state.on);
  if (state.mode !== null) values.set('hvac_mode', state.mode);
  if (state.temp !== null) values.set('target_temperature', state.temp);
  if (state.speed !== null) values.set('fan_mode', String(state.speed));
  return values;
}
