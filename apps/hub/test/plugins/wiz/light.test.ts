import { describe, expect, it } from 'vitest';
import {
  CommandRefusedError,
  type CapabilityKey,
  type DeviceCommand,
} from '@smarteverything/domain';
import {
  wizCapabilities,
  wizCommand,
  wizDevice,
  wizExternalId,
  wizReadings,
} from '../../../src/plugins/builtin/wiz/light';
import type { WizSaved } from '../../../src/plugins/builtin/wiz/protocol';
import { BULB_MAC, COLOUR_PILOT } from './fake-wiz';

function bulb(moduleName: string | undefined, pilot: WizSaved['pilot'] = COLOUR_PILOT): WizSaved {
  return {
    mac: BULB_MAC,
    address: '192.168.1.20',
    config: moduleName === undefined ? {} : { moduleName, extRange: [2200, 6500] },
    pilot,
  };
}

function command(capability: CapabilityKey, value: DeviceCommand['value']): DeviceCommand {
  return { commandId: 'command-1', externalId: wizExternalId(BULB_MAC), capability, value };
}

describe('WiZ lights', () => {
  it('names a light after its kind and the end of its MAC address', () => {
    expect(wizDevice(bulb('ESP01_SHRGB_03'), true).name).toBe('WiZ colour light 3ABC');
    expect(wizDevice(bulb('ESP01_SHTW_01'), true).name).toBe('WiZ white light 3ABC');
    expect(wizDevice(bulb('ESP01_SHDW_01'), true).name).toBe('WiZ dimmable light 3ABC');
    expect(wizDevice(bulb(undefined), true).name).toBe('WiZ light 3ABC');
  });

  it('offers the controls its kind supports', () => {
    const keys = (module: string): string[] =>
      wizCapabilities(bulb(module)).map((capability) => capability.key);
    expect(keys('ESP01_SHRGB_03')).toEqual([
      'power',
      'brightness',
      'color',
      'color_temperature',
      'light_effect',
    ]);
    expect(keys('ESP01_SHTW_01')).toEqual([
      'power',
      'brightness',
      'color_temperature',
      'light_effect',
    ]);
    expect(keys('ESP01_DW_01')).toEqual(['power', 'brightness']);
  });

  it('offers brightness to a light of unknown kind that reports dimming', () => {
    expect(wizCapabilities(bulb(undefined)).map((capability) => capability.key)).toEqual([
      'power',
      'brightness',
    ]);
    expect(
      wizCapabilities(bulb(undefined, { mac: BULB_MAC, state: true })).map(
        (capability) => capability.key,
      ),
    ).toEqual(['power']);
  });

  it('reads colour from the red, green and blue channels', () => {
    const readings = wizReadings(bulb('ESP01_SHRGB_03'));
    expect(readings.get('color')).toEqual({ hue: 0, saturation: 100, value: 100 });
    expect(readings.get('color_temperature')).toBeNull();
    expect(readings.get('power')).toBe(true);
    expect(readings.get('brightness')).toBe(60);
  });

  it('reads white from the colour temperature', () => {
    const readings = wizReadings(
      bulb('ESP01_SHRGB_03', { mac: BULB_MAC, state: true, temp: 2700 }),
    );
    expect(readings.get('color_temperature')).toBe(2700);
    expect(readings.get('color')).toBeNull();
  });

  it('reads the running scene by name', () => {
    expect(
      wizReadings(bulb('ESP01_SHRGB_03', { mac: BULB_MAC, sceneId: 4 })).get('light_effect'),
    ).toBe('party');
  });

  it('turns controls into WiZ parameters', () => {
    const light = bulb('ESP01_SHRGB_03');
    expect(wizCommand(light, command('power', false))).toEqual({ state: false });
    expect(wizCommand(light, command('brightness', 40))).toEqual({ dimming: 40 });
    expect(wizCommand(light, command('color_temperature', 3000))).toEqual({ temp: 3000 });
    expect(wizCommand(light, command('light_effect', 'party'))).toEqual({ sceneId: 4 });
    expect(wizCommand(light, command('color', { hue: 120, saturation: 100, value: 100 }))).toEqual({
      r: 0,
      g: 255,
      b: 0,
    });
  });

  it('refuses a control the light does not have', () => {
    expect(() =>
      wizCommand(bulb('ESP01_DW_01'), command('color', { hue: 0, saturation: 0, value: 0 })),
    ).toThrow(CommandRefusedError);
  });
});
