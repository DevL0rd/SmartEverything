import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MICROWAVE_KEYS,
  MODEL_OVERRIDES,
  curatedControls,
  deviceFamily,
  sleepsBetweenUse,
  inTier,
  pickableControls,
  presentCapability,
  presentDevice,
  presentValue,
  withRole,
  DEVICE_CAPABILITY,
  type DeviceCapability,
  type DeviceKind,
  type PresentedCapability,
} from '../src';
import { laundryOverride } from '../src/presentation/overrides/xiaomi-laundry';

function capability(
  key: string,
  label: string,
  value: Record<string, unknown>,
  access = 'read_write',
): DeviceCapability {
  return DEVICE_CAPABILITY.parse({ key, label, access, value });
}

const MICROWAVE_CAPABILITIES = [
  capability(MICROWAVE_KEYS.mode, 'Oven mode', { kind: 'enum', options: ['MicroWave', 'Grill'] }),
  capability(MICROWAVE_KEYS.power, 'Power level', { kind: 'enum', options: ['100%'] }),
  capability(MICROWAVE_KEYS.state, 'Operating state', { kind: 'enum', options: ['ready'] }, 'read'),
  capability(
    'raw:samsungce.device_identification.serial_number',
    'Device identification: serial number',
    {
      kind: 'text',
      maxLength: 40,
    },
  ),
  capability(
    MICROWAVE_KEYS.stageStatus,
    'Cook recipe: stage status',
    { kind: 'text', maxLength: 4096 },
    'read',
  ),
  capability('power', 'Power', { kind: 'boolean' }),
];

function microwave(
  overrides: { kind?: DeviceKind; model?: string; keys?: readonly string[] } = {},
): { kind: DeviceKind; model: string; capabilities: readonly DeviceCapability[] } {
  const wanted = overrides.keys;
  return {
    kind: overrides.kind ?? 'appliance',
    model: overrides.model ?? 'TP1X_DA-KS-MICROWAVE-99999',
    capabilities: MICROWAVE_CAPABILITIES.filter(
      (entry) => wanted === undefined || wanted.includes(entry.key),
    ),
  } as const;
}

describe('presenting a microwave by what it can do', () => {
  it('recognises any appliance with the cooking capabilities, whatever its model', () => {
    expect(deviceFamily(microwave())).toBe('microwave');
    expect(deviceFamily(microwave({ model: 'TP2X_OTHER' }))).toBe('microwave');
  });

  it('needs the appliance kind and every cooking capability', () => {
    expect(deviceFamily(microwave({ kind: 'sensor' }))).toBe('sensor');
    expect(deviceFamily(microwave({ keys: [MICROWAVE_KEYS.mode, MICROWAVE_KEYS.power] }))).toBe(
      'generic',
    );
    expect(deviceFamily({ kind: 'appliance', model: 'TP1X_DA-KS-MICROWAVE-99999' })).toBe(
      'generic',
    );
  });

  it('lets a model-specific override win over the capability match', () => {
    const [model] = Object.keys(MODEL_OVERRIDES);
    const device = { ...microwave(), model: model ?? '' };
    expect(deviceFamily(device)).toBe(MODEL_OVERRIDES[device.model]?.family);
  });

  it('shows every capability the override does not list as a read-only detail', () => {
    const presentation = presentDevice(microwave());
    const serial = presentation.capabilities.find(
      (presented) => presented.key === 'raw:samsungce.device_identification.serial_number',
    );
    expect(serial).toMatchObject({
      tier: 'diagnostic',
      groupLabel: 'Details',
      writable: false,
      label: 'Serial number',
    });
  });

  it('leaves standard capabilities and listed ones as they are', () => {
    const presentation = presentDevice(microwave());
    expect(presentation.capabilities.find((entry) => entry.key === 'power')).toMatchObject({
      tier: 'primary',
      writable: true,
    });
    expect(
      presentation.capabilities.find((entry) => entry.key === MICROWAVE_KEYS.mode),
    ).toMatchObject({
      label: 'Cooking mode',
      tier: 'primary',
      role: 'mode',
    });
  });

  it('labels cooking modes from the one table', () => {
    const mode = presentDevice(microwave()).capabilities.find(
      (entry) => entry.key === MICROWAVE_KEYS.mode,
    );
    expect(mode?.options).toEqual([
      { value: 'MicroWave', label: 'Microwave' },
      { value: 'Grill', label: 'Grill' },
    ]);
  });

  it('formats readings with the override hook', () => {
    const presentation = presentDevice(microwave());
    const stage = presentation.capabilities.find(
      (entry) => entry.key === MICROWAVE_KEYS.stageStatus,
    );
    if (stage === undefined) {
      throw new Error('missing stage');
    }
    expect(presentValue(stage, { currentStage: { stageNumber: 1 } })).toBe('Stage 1');
    expect(presentValue(stage, null)).toBe('Unknown');
  });
});

describe('presenting a generic device', () => {
  const device = {
    kind: 'light',
    model: 'generic.model',
    capabilities: [
      capability('power', 'Power', { kind: 'boolean' }),
      capability('brightness', 'Brightness', {
        kind: 'number',
        min: 0,
        max: 100,
        step: 1,
        unit: 'percentage',
      }),
      capability('color', 'Colour', { kind: 'color' }),
      capability('color_temperature', 'White', { kind: 'number', min: 2000, max: 6500, step: 100 }),
      capability('target_temperature', 'Target', {
        kind: 'number',
        min: 10,
        max: 30,
        step: 0.5,
        unit: 'celsius',
      }),
      capability('hvac_mode', 'HVAC', { kind: 'enum', options: ['heat', 'cool'] }),
      capability('fan_mode', 'Fan', { kind: 'enum', options: ['auto'] }),
      capability('fan_speed', 'Speed', { kind: 'number', min: 1, max: 3, step: 1 }),
      capability('call_status', 'Call', { kind: 'enum', options: ['idle', 'ringing'] }),
      capability('raw:vendor.thing', 'Vendor: thing name', { kind: 'text', maxLength: 10 }),
      capability(
        'raw:vendor.firmware',
        'Firmware version',
        { kind: 'text', maxLength: 10 },
        'read',
      ),
      capability('raw:vendor:webrtc', 'WebRTC start', { kind: 'action' }),
      capability('raw:vendor:restart', 'Restart', { kind: 'action' }),
    ],
  } as const;

  const at = (index: number): DeviceCapability => {
    const found = device.capabilities[index];
    if (found === undefined) {
      throw new Error(String(index));
    }
    return found;
  };

  it('puts primary controls first and sorts the rest by tier and role', () => {
    const keys = presentDevice(device).capabilities.map((entry) => entry.key);
    expect(keys.slice(0, 3)).toEqual(['power', 'hvac_mode', 'target_temperature']);
    expect(keys.indexOf('raw:vendor.thing')).toBeGreaterThan(keys.indexOf('fan_speed'));
  });

  it('names raw capabilities from their provider label', () => {
    const raw = presentCapability(device, at(9));
    expect(raw).toMatchObject({
      label: 'Thing name',
      groupLabel: 'Vendor',
      tier: 'extra',
      role: null,
    });
    const plain = presentCapability(device, at(11));
    expect(plain).toMatchObject({ label: 'Web RTC start', tier: 'hidden', groupLabel: 'Device' });
    expect(presentCapability(device, at(10)).tier).toBe('diagnostic');
    expect(presentCapability(device, at(12)).tier).toBe('extra');
  });

  it('reads units from the descriptor and refuses writes to read-only standards', () => {
    expect(presentCapability(device, at(1)).unit).toBe('%');
    expect(presentCapability(device, at(2)).unit).toBeNull();
    expect(presentCapability(device, at(8)).writable).toBe(false);
  });

  it('curates at most six writable primary controls without power', () => {
    const curated = curatedControls(presentDevice(device));
    expect(curated).toHaveLength(6);
    expect(curated.map((entry) => entry.key)).not.toContain('power');
  });

  it('lists tiers, roles and pickable controls', () => {
    const presentation = presentDevice(device);
    expect(inTier(presentation, 'hidden').map((entry) => entry.key)).toEqual(['raw:vendor:webrtc']);
    expect(withRole(presentation, 'power')?.key).toBe('power');
    expect(withRole(presentation, 'cleaning')).toBeUndefined();
    expect(withRole(presentation, 'cleaning')).toBeUndefined();
    expect(withRole(presentation, 'power')).toBe(withRole(presentation, 'power'));
    const pickable = pickableControls(device).map((entry) => entry.key);
    expect(pickable).toContain('brightness');
    expect(pickable).not.toContain('raw:vendor:webrtc');
    expect(pickable).not.toContain('call_status');
  });

  it('writes values the way people read them', () => {
    const presentation = presentDevice(device);
    const find = (key: string): PresentedCapability => {
      const found = presentation.capabilities.find((entry) => entry.key === key);
      if (found === undefined) {
        throw new Error(key);
      }
      return found;
    };
    expect(presentValue(find('hvac_mode'), 'heat')).toBe('Heat');
    expect(presentValue(find('hvac_mode'), 'dry_out')).toBe('Dry out');
    expect(presentValue(find('brightness'), 40)).toBe('40%');
    expect(presentValue(find('target_temperature'), 21)).toBe('21.0°C');
    expect(presentValue(find('raw:vendor:restart'), true)).toBe('Restart');
    expect(presentValue(find('power'), true)).toBe('On');
    expect(presentValue(find('raw:vendor.thing'), 'abc')).toBe('abc');
    expect(presentValue(find('power'), null)).toBe('Unknown');
  });

  it('uses the state words an override gives a boolean', () => {
    const lock = {
      kind: 'lock',
      model: 'generic',
      capabilities: [capability('locked', 'Locked', { kind: 'boolean' })],
    } as const;
    const [presented] = presentDevice(lock).capabilities;
    if (presented === undefined) {
      throw new Error('missing');
    }
    expect(presentValue(presented, true)).toBe('Locked');
  });
});

describe('device families', () => {
  it('names a family from the model when no override applies', () => {
    expect(deviceFamily({ kind: 'sensor', model: 'xiaomi.scales.x1' })).toBe('scale');
    expect(deviceFamily({ kind: 'other', model: 'miwear.band.b1' })).toBe('wearable');
  });

  it('knows which families sleep between use', () => {
    expect(sleepsBetweenUse({ kind: 'sensor', model: 'xiaomi.scales.x1' })).toBe(true);
    expect(sleepsBetweenUse({ kind: 'light', model: 'generic' })).toBe(false);
  });
});

describe('boolean state words', () => {
  it('uses the words an override gives and falls back for non-booleans', () => {
    const phone = {
      kind: 'phone',
      model: 'SmartThings-smartthings-Mobile_Presence',
      capabilities: [capability('occupancy', 'Presence', { kind: 'boolean' })],
    } as const;
    const [presented] = presentDevice(phone).capabilities;
    if (presented === undefined) {
      throw new Error('missing');
    }
    expect(presentValue(presented, true)).toBe('Home');
    expect(presentValue(presented, false)).toBe('Away');
    expect(presentValue(presented, 'x')).toBe('x');
  });
});

describe('presenting the washer-dryer', () => {
  const WASHER_CAPABILITIES = z
    .array(DEVICE_CAPABILITY)
    .parse(
      JSON.parse(
        readFileSync(new URL('fixtures/mibx5-f29gl-capabilities.json', import.meta.url), 'utf8'),
      ),
    );
  const washer = {
    kind: 'appliance',
    model: 'mibx5.washer.f29gl',
    capabilities: WASHER_CAPABILITIES,
  } as const;

  it('puts the live model in the laundry family and unknown washers too', () => {
    expect(deviceFamily(washer)).toBe('laundry');
    expect(deviceFamily({ kind: 'appliance', model: 'acme.washer.x1' })).toBe('laundry');
    expect(deviceFamily({ kind: 'appliance', model: 'acme.dryer.x1' })).toBe('laundry');
    expect(deviceFamily({ kind: 'other', model: 'acme.washable.x1' })).toBe('generic');
  });

  it('lists every live capability so none shows its raw provider name', () => {
    const listed = MODEL_OVERRIDES['mibx5.washer.f29gl']?.capabilities ?? {};
    const missing = WASHER_CAPABILITIES.filter((entry) => !(entry.key in listed)).map(
      (entry) => entry.key,
    );
    expect(missing).toEqual([]);
  });

  it('gives every option of every live choice a clean label', () => {
    for (const presented of presentDevice(washer).capabilities) {
      for (const option of presented.options) {
        expect(option.label, `${presented.label}: ${option.value}`).not.toMatch(
          /[a-z][A-Z]|Malfunction|Unopenable|Wash Dry|ECO4060|Lots Of/,
        );
      }
    }
  });

  it('assigns each live capability the role the app reads it by', () => {
    const roles = Object.fromEntries(
      presentDevice(washer).capabilities.map((entry) => [entry.key, entry.role]),
    );
    expect(roles).toMatchObject({
      power: 'power',
      'raw:2.2': 'laundry_status',
      'raw:2.11': 'laundry_phase',
      'raw:2.20': 'laundry_phases',
      'raw:2.3': 'laundry_program',
      'raw:18.1': 'laundry_dial',
      'raw:2.10': 'remaining_minutes',
      'raw:2.9': 'door_state',
      'raw:2.4': 'fault',
      'raw:action.2.2': 'cycle_start',
      'raw:action.2.1': 'cycle_stop',
      'raw:17.1': 'remote_control',
      'raw:2.13': 'wash_count',
      'raw:2.39': 'energy_use',
      'raw:2.40': 'water_use',
      child_lock: 'child_lock',
    });
  });

  it('asks before stopping a cycle and before rinsing a tank, and hides the vendor plumbing', () => {
    const byKey = new Map<string, PresentedCapability>(
      presentDevice(washer).capabilities.map((entry) => [entry.key, entry]),
    );
    expect(byKey.get('raw:action.2.1')?.danger).toEqual({ tier: 'confirm' });
    expect(byKey.get('raw:action.11.1')?.danger).toEqual({ tier: 'confirm' });
    expect(byKey.get('raw:action.2.2')?.danger).toEqual({ tier: 'none' });
    for (const key of [
      'raw:29.1',
      'raw:6.1',
      'raw:action.6.1',
      'raw:action.6.2',
      'raw:8.4',
      'raw:9.5',
    ]) {
      expect(byKey.get(key)?.tier, key).toBe('hidden');
    }
    for (const key of ['raw:1.5', 'firmware', 'raw:2.20', 'raw:18.1', 'raw:2.39', 'raw:2.40']) {
      expect(byKey.get(key)?.tier, key).toBe('diagnostic');
    }
    expect(byKey.get('raw:2.2')?.options.map((option) => option.label)).toContain('Ready');
    expect(byKey.get('raw:2.10')?.unit).toBe('min');
  });

  it('lets another washer reuse the labels by naming only its keys', () => {
    const other = laundryOverride({ laundry_status: 'raw:3.1', fault: 'raw:3.2' });
    expect(other.family).toBe('laundry');
    expect(other.capabilities['raw:3.1']).toMatchObject({
      role: 'laundry_status',
      label: 'Status',
    });
    expect(other.capabilities['raw:3.2']).toMatchObject({ role: 'fault' });
    expect(other.capabilities['raw:2.2']).toBeUndefined();
    expect(other.unlisted).toEqual({ tier: 'diagnostic', group: 'system' });
  });
});
