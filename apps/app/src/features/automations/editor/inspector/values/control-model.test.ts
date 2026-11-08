import {
  NODE_REGISTRY,
  type DeviceCapability,
  type DeviceKind,
  type PortValue,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../../../store/device-fixture';
import { fieldOf, type FieldControl } from '../schema-fields';
import type { Device } from '../../../../../store/state';
import {
  NEEDS_TARGET,
  NOT_ON_TARGET,
  NO_DEVICES,
  controlChoices,
  controlRows,
  controlTypingOf,
  homeTemperatureUnit,
  numberScale,
  reachOfPorts,
  specOf,
  type ControlChoices,
  type ControlHome,
  type ControlReach,
  type ControlSpec,
  type ControlValueSpec,
} from './control-model';
import { NO_PORT_SCOPE, typedControl, type PortScope } from './literal-model';

function cap(
  key: DeviceCapability['key'],
  value: DeviceCapability['value'],
  access: DeviceCapability['access'] = 'read_write',
): DeviceCapability {
  return { key, label: key, access, value };
}

const POWER = cap('power', { kind: 'boolean' });

function device(
  id: string,
  kind: DeviceKind,
  room: string,
  capabilities: readonly DeviceCapability[],
): Device {
  return deviceFixture(0, { id, kind, room_id: room, capabilities: [...capabilities] });
}

const lamp = device('lamp', 'light', 'hall', [
  POWER,
  cap('brightness', { kind: 'number', min: 1, max: 100, step: 1, unit: 'percentage' }),
  cap('color_temperature', { kind: 'number', min: 2700, max: 6500, step: 100, unit: 'kelvin' }),
  cap('color', { kind: 'color' }),
  cap('light_effect', { kind: 'enum', options: ['ocean', 'party'] }),
]);
const bulb = device('bulb', 'light', 'hall', [
  POWER,
  cap('brightness', { kind: 'number', min: 0, max: 255, step: 5, unit: 'percentage' }),
  cap('light_effect', { kind: 'enum', options: ['party', 'focus'] }),
]);
const heater = device('heater', 'heater', 'hall', [
  POWER,
  cap('target_temperature', { kind: 'number', min: 16, max: 30, step: 0.5, unit: 'celsius' }),
  cap('temperature', { kind: 'number', min: -20, max: 60, step: 0.1, unit: 'celsius' }, 'read'),
  cap('filter_reset', { kind: 'action' }),
]);

const HOME: ControlHome = {
  devices: [lamp, bulb, heater],
  groups: [{ id: 'lights', device_ids: ['lamp', 'bulb'] }],
};

function ready(choices: ControlChoices): Extract<ControlChoices, { status: 'ready' }> {
  if (choices.status !== 'ready') throw new Error(`not ready: ${choices.reason}`);
  return choices;
}

function idsOf(choices: ControlChoices): readonly string[] {
  return ready(choices).specs.map((spec) => spec.id);
}

function valueOf(choices: ControlChoices, id: string): ControlValueSpec | undefined {
  return specOf(ready(choices).specs, id)?.value;
}

const deviceReach = (id: string): ControlReach => reachOfPorts({ target: { lit: { device: id } } });

describe('control picker lists only valid controls', () => {
  it('lists writable controls without readings or actions where the port sets a value', () => {
    const ids = idsOf(controlChoices(HOME, deviceReach('heater'), 'writable'));
    expect(ids).toContain('power');
    expect(ids).toContain('target_temperature');
    expect(ids).not.toContain('temperature');
    expect(ids).not.toContain('filter_reset');
  });

  it('lists readings for a watching port and only actions for an action port', () => {
    expect(idsOf(controlChoices(HOME, deviceReach('heater'), 'shown'))).toContain('temperature');
    expect(idsOf(controlChoices(HOME, deviceReach('heater'), 'action'))).toEqual(['filter_reset']);
  });

  it('gives human labels and says how many devices of a room have each control', () => {
    const choices = ready(
      controlChoices(HOME, reachOfPorts({ room: { lit: 'hall' } }), 'writable'),
    );
    expect(choices.devices).toBe(3);
    const rows = controlRows(choices.specs, choices.devices, []);
    const brightness = rows.find((row) => row.id === 'brightness');
    expect(brightness?.label).toBe('Brightness');
    expect(brightness?.detail).toMatch(/on 2 of 3$/u);
    expect(rows.find((row) => row.id === 'power')?.detail).not.toMatch(/ of /u);
  });

  it('keeps a stored control that the target lacks, marked as not on the devices', () => {
    const specs: readonly ControlSpec[] = ready(
      controlChoices(HOME, deviceReach('lamp'), 'writable'),
    ).specs;
    const missing = controlRows(specs, 1, ['target_temperature']).at(-1);
    expect(missing).toMatchObject({ id: 'target_temperature', unavailable: NOT_ON_TARGET });
  });

  it('reaches devices through groups, rooms with families, a family alone and device lists', () => {
    const group = reachOfPorts({ target: { lit: { group: 'lights' } } });
    expect(idsOf(controlChoices(HOME, group, 'writable'))).not.toContain('target_temperature');
    const heaters = reachOfPorts({ target: { lit: { room: 'hall', families: ['heater'] } } });
    expect(idsOf(controlChoices(HOME, heaters, 'writable'))).not.toContain('brightness');
    const family = reachOfPorts({ family: { lit: 'light' } });
    expect(idsOf(controlChoices(HOME, family, 'writable'))).toContain('color_temperature');
    const list = reachOfPorts({ target: { lit: { devices: ['bulb'] } } });
    expect(idsOf(controlChoices(HOME, list, 'writable'))).not.toContain('color');
  });

  it('says why nothing is listed instead of offering free text', () => {
    expect(controlChoices(HOME, reachOfPorts({}), 'writable')).toEqual({
      status: 'unavailable',
      reason: NEEDS_TARGET,
    });
    expect(controlChoices(HOME, reachOfPorts({ room: { lit: 'attic' } }), 'shown')).toEqual({
      status: 'unavailable',
      reason: NO_DEVICES,
    });
    const wired = reachOfPorts({ target: { wire: { from: 'a', port: 'b' } } });
    expect(controlChoices(HOME, wired, 'shown').status).toBe('unavailable');
  });
});

describe('value editors are typed by the picked control', () => {
  const lampChoices = controlChoices(HOME, deviceReach('lamp'), 'writable');

  it('types switch, colour, kelvin and enum controls from the device', () => {
    expect(valueOf(lampChoices, 'power')).toEqual({ t: 'switch', on: 'On', off: 'Off' });
    expect(valueOf(lampChoices, 'color')).toEqual({ t: 'colour' });
    expect(valueOf(lampChoices, 'color_temperature')).toMatchObject({
      t: 'number',
      kelvin: true,
      min: 2700,
      max: 6500,
      step: 100,
    });
    const effect = valueOf(lampChoices, 'light_effect');
    expect(effect?.t === 'choice' ? effect.options.map((o) => o.id) : []).toEqual([
      'ocean',
      'party',
    ]);
  });

  it('uses the device range and unit, joined across the devices of a group', () => {
    const group = controlChoices(
      HOME,
      reachOfPorts({ target: { lit: { group: 'lights' } } }),
      'writable',
    );
    expect(valueOf(group, 'brightness')).toEqual({
      t: 'number',
      min: 0,
      max: 255,
      step: 1,
      unit: '%',
      kelvin: false,
    });
    const effect = valueOf(group, 'light_effect');
    expect(effect?.t === 'choice' ? effect.options.map((o) => o.id) : []).toEqual([
      'ocean',
      'party',
      'focus',
    ]);
  });
});

describe('temperature shows the home unit and stores the control unit', () => {
  const heaterChoices = controlChoices(HOME, deviceReach('heater'), 'writable');
  const target = valueOf(heaterChoices, 'target_temperature');
  if (target?.t !== 'number') throw new Error('target temperature is not a number');

  it('shows Fahrenheit for a US home and stores Celsius on the step of the device', () => {
    const scale = numberScale(target, 'f');
    expect(scale).toMatchObject({ min: 60.8, max: 86, step: 0.9, unit: '°F' });
    expect(scale.shown(21)).toBe(69.8);
    expect(scale.stored(69.8)).toBe(21);
    expect(scale.stored(70)).toBe(21);
    expect(scale.stored(200)).toBe(30);
  });

  it('keeps the control unit when the home uses it or the home unit is unknown', () => {
    for (const home of ['c', null] as const) {
      const scale = numberScale(target, home);
      expect(scale).toMatchObject({ min: 16, max: 30, step: 0.5, unit: '°C' });
      expect(scale.stored(21.3)).toBe(21.5);
    }
  });

  it('reads the home unit from the region', () => {
    const source = { locale: 'en-US', timeZone: 'America/New_York' };
    expect(homeTemperatureUnit({ region: 'auto' }, source)).toBe('f');
    expect(homeTemperatureUnit({ region: 'DE' }, source)).toBe('c');
  });
});

describe('typing a value port by its control port', () => {
  it('reads the picked control and its source, and ignores ports that are not controls', () => {
    const scope = {
      ...NO_PORT_SCOPE,
      ports: { control: { lit: 'brightness' } },
      controls: {
        control: { t: 'pick', source: 'device.writable_controls', multiple: false },
        tool: { t: 'pick', source: 'tools', multiple: false },
      },
    } as const;
    const typed = { t: 'typedBy', port: 'control', base: { t: 'json' } } as const;
    expect(controlTypingOf(typed, scope)).toEqual({
      source: 'device.writable_controls',
      scope: 'writable',
      control: 'brightness',
    });
    expect(controlTypingOf({ ...typed, port: 'tool' }, scope)).toBeNull();
  });
});

describe('device.set to is edited by the picked control', () => {
  const inputs = NODE_REGISTRY.get('device.set')?.inputs ?? [];
  const controls: Record<string, FieldControl> = Object.fromEntries(
    inputs.map((decl) => [decl.name, fieldOf(decl).control]),
  );
  const given = controls['to'];
  if (given?.t !== 'typedBy') throw new Error('device.set to is not typed by its control');
  const to = given;

  function editorFor(control: string): ControlValueSpec | undefined {
    const ports: Record<string, PortValue> = {
      target: { lit: { device: 'lamp' } },
      control: { lit: control },
    };
    const scope: PortScope = { ...NO_PORT_SCOPE, ports, controls };
    const typed = typedControl(to, scope);
    if (typed.t !== 'control') throw new Error('to fell back to a plain field');
    const choices = controlChoices(HOME, reachOfPorts(ports), typed.typing.scope);
    return valueOf(choices, typed.typing.control);
  }

  it('picks the control from the writable controls of the target', () => {
    expect(controls['control']).toEqual({
      t: 'pick',
      source: 'device.writable_controls',
      multiple: false,
    });
  });

  it('gives a switch, a ranged number with unit, a colour, a choice or a kelvin slider', () => {
    expect(editorFor('power')).toEqual({ t: 'switch', on: 'On', off: 'Off' });
    expect(editorFor('brightness')).toEqual({
      t: 'number',
      min: 1,
      max: 100,
      step: 1,
      unit: '%',
      kelvin: false,
    });
    expect(editorFor('color')).toEqual({ t: 'colour' });
    expect(editorFor('light_effect')).toMatchObject({ t: 'choice' });
    expect(editorFor('color_temperature')).toMatchObject({ t: 'number', kelvin: true });
  });
});
