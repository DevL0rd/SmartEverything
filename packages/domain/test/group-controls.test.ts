import { describe, expect, it } from 'vitest';
import {
  DEVICE_ROW,
  groupControlChoices,
  planGroupCommands,
  sharedControls,
  type DeviceRow,
} from '../src';

let counter = 0;

const POWER = { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } };
const BRIGHTNESS = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 1, max: 100, step: 1 },
};
const COLOUR = { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } };
const WHITE = {
  key: 'color_temperature',
  label: 'Colour temperature',
  access: 'read_write',
  value: { kind: 'number', min: 2700, max: 6500, step: 100 },
};

function device(overrides: Record<string, unknown>): DeviceRow {
  counter += 1;
  return DEVICE_ROW.parse({
    id: `7e000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`,
    provider: 'xiaomi',
    external_id: `target-state-${String(counter)}`,
    parent_id: null,
    kind: 'light',
    name: `Light ${String(counter)}`,
    display_name: null,
    model: 'generic.model',
    manufacturer: 'Maker',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [POWER, BRIGHTNESS, COLOUR, WHITE],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-08T10:00:00.000Z',
    updated_at: '2026-10-08T10:00:00.000Z',
    ...overrides,
  });
}

describe('sharedControls', () => {
  it('lists the roles of controls offered by any member, in order of discovery', () => {
    const full = device({});
    const white = device({ capabilities: [POWER, BRIGHTNESS] });
    expect(sharedControls([white, full])).toEqual([
      'power',
      'brightness',
      'color_temperature',
      'color',
    ]);
  });

  it('skips controls that are read-only, dangerous or actions', () => {
    const lock = device({
      kind: 'lock',
      capabilities: [
        { key: 'lock', label: 'Lock', access: 'read_write', value: { kind: 'boolean' } },
        { key: 'restart', label: 'Restart', access: 'write', value: { kind: 'action' } },
        {
          key: 'temperature',
          label: 'Temperature',
          access: 'read',
          value: { kind: 'number', min: 0, max: 50, step: 1 },
        },
      ],
    });
    const roles = sharedControls([lock]);
    expect(roles).not.toContain('restart');
    expect(roles).not.toContain('temperature');
  });

  it('skips curated actions and text fields', () => {
    const diffuserWith = (key: string, value: Record<string, unknown>): DeviceRow =>
      device({
        kind: 'other',
        model: 'xiaomi.diffuser.xw2iv',
        capabilities: [{ key, label: 'Control', access: 'read_write', value }],
      });
    expect(sharedControls([diffuserWith('raw:action.4.1', { kind: 'action' })])).toEqual([]);
    expect(sharedControls([diffuserWith('raw:3.1', { kind: 'text', maxLength: 8 })])).toEqual([]);
    expect(sharedControls([diffuserWith('raw:3.1', { kind: 'boolean' })])).toEqual([
      'ambient_light',
    ]);
  });

  it('leaves out controls that have no role but still offers them as group choices', () => {
    const oven = device({
      kind: 'appliance',
      model: 'TP1X_DA-KS-MICROWAVE-01041|40475341|50040100021811000A00000000000000',
      capabilities: [
        {
          key: 'raw:samsungce.oven_mode.oven_mode',
          label: 'Mode',
          access: 'read',
          value: { kind: 'text', maxLength: 32 },
        },
        {
          key: 'raw:samsungce.oven_operating_state.operating_state',
          label: 'State',
          access: 'read',
          value: { kind: 'text', maxLength: 32 },
        },
        {
          key: 'raw:samsungce.microwave_power.power_level',
          label: 'Power',
          access: 'read_write',
          value: { kind: 'number', min: 100, max: 900, step: 100 },
        },
      ],
    });
    expect(sharedControls([oven])).toEqual([]);
    expect(groupControlChoices([oven]).map((choice) => choice.reference)).toEqual([
      'raw:samsungce.microwave_power.power_level',
    ]);
  });

  it('is empty for no devices', () => {
    expect(sharedControls([])).toEqual([]);
  });
});

describe('groupControlChoices', () => {
  it('counts the members that support each control and keeps the first member', () => {
    const full = device({});
    const white = device({ capabilities: [POWER, BRIGHTNESS] });
    const choices = groupControlChoices([full, white]);
    const power = choices.find((choice) => choice.reference === 'power');
    const colour = choices.find((choice) => choice.reference === 'color');
    expect(power).toMatchObject({ supported: 2, device: full });
    expect(colour).toMatchObject({ supported: 1, device: full });
  });

  it('merges brightness ranges into a percentage every member can reach', () => {
    const fine = device({});
    const coarse = device({
      capabilities: [
        POWER,
        { ...BRIGHTNESS, value: { kind: 'number', min: 10, max: 200, step: 1 } },
      ],
    });
    const brightness = groupControlChoices([fine, coarse]).find(
      (choice) => choice.reference === 'brightness',
    );
    expect(brightness?.presented.capability.value).toMatchObject({ min: 5, max: 100, step: 1 });
  });

  it('merges other numeric ranges to their overlap and coarsest step', () => {
    const wide = device({});
    const narrow = device({
      capabilities: [
        POWER,
        { ...WHITE, value: { kind: 'number', min: 3000, max: 5000, step: 500 } },
      ],
    });
    const white = groupControlChoices([wide, narrow]).find(
      (choice) => choice.reference === 'color_temperature',
    );
    expect(white?.presented.capability.value).toMatchObject({ min: 3000, max: 5000, step: 500 });
  });

  it('drops a numeric control whose members share no range', () => {
    const warm = device({
      capabilities: [
        POWER,
        { ...WHITE, value: { kind: 'number', min: 2700, max: 3000, step: 100 } },
      ],
    });
    const cool = device({
      capabilities: [
        POWER,
        { ...WHITE, value: { kind: 'number', min: 4000, max: 6500, step: 100 } },
      ],
    });
    expect(
      groupControlChoices([warm, cool]).some((choice) => choice.reference === 'color_temperature'),
    ).toBe(false);
  });

  it('unions the options of an enumerated control', () => {
    const fan = (options: readonly string[]): DeviceRow =>
      device({
        kind: 'air_purifier',
        capabilities: [
          {
            key: 'purifier_mode',
            label: 'Mode',
            access: 'read_write',
            value: { kind: 'enum', options },
          },
        ],
      });
    const speed = groupControlChoices([fan(['low', 'high']), fan(['high', 'turbo'])]).find(
      (choice) => choice.reference === 'purifier_mode',
    );
    expect(speed?.presented.options.map((option) => option.value)).toEqual([
      'low',
      'high',
      'turbo',
    ]);
    expect(speed?.presented.capability.value).toMatchObject({
      kind: 'enum',
      options: ['low', 'high', 'turbo'],
    });
  });
});

describe('planGroupCommands with a colour', () => {
  it('sends a colour to a member with a colour control as the control writes it', () => {
    const lamp = device({});
    const plan = planGroupCommands([lamp], {
      capability: 'color',
      value: { hue: 120, saturation: 100, value: 100 },
    });
    expect(plan.skipped).toStrictEqual([]);
    expect(plan.commands).toStrictEqual([
      {
        device_id: lamp.id,
        capability: 'color',
        value: { hue: 120, saturation: 100, value: 100 },
      },
    ]);
  });

  it('skips a member that has no colour control', () => {
    const plain = device({ capabilities: [POWER] });
    const plan = planGroupCommands([plain], {
      capability: 'color',
      value: { hue: 120, saturation: 100, value: 100 },
    });
    expect(plan.commands).toStrictEqual([]);
    expect(plan.skipped).toStrictEqual([{ deviceId: plain.id, reason: 'unsupported' }]);
  });
});
