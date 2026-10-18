import {
  checkValue,
  HSV_COLOR,
  hsvToRgbChannels,
  rgbChannelsToHsv,
  CommandRefusedError,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceCommand,
  type DiscoveredDevice,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { WIZ_SCENES, wizBulbClass, wizScenes, type WizBulbClass } from './scenes';
import { WIZ_MIN_BRIGHTNESS, type WizConfig, type WizSaved } from './protocol';

export function wizExternalId(mac: string): string {
  return `wiz:${mac}`;
}
function number(
  key: CapabilityKey,
  label: string,
  range: readonly [number, number],
  unit: string,
): DeviceCapability {
  return {
    key,
    label,
    access: 'read_write',
    value: { kind: 'number', min: range[0], max: range[1], step: 1, unit },
  };
}
function temperatureRange(config: WizConfig): readonly number[] | undefined {
  return config.extRange ?? config.cctRange ?? config.whiteRange;
}
export function wizCapabilities(bulb: WizSaved): DeviceCapability[] {
  const kind = wizBulbClass(bulb.config.moduleName);
  const result: DeviceCapability[] = [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  ];
  if (kind !== 'unknown' || bulb.pilot.dimming !== undefined)
    result.push(number('brightness', 'Brightness', [WIZ_MIN_BRIGHTNESS, 100], '%'));
  if (kind === 'rgb')
    result.push({ key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } });
  const range = temperatureRange(bulb.config);
  if ((kind === 'rgb' || kind === 'tunable') && range !== undefined)
    result.push(
      number(
        'color_temperature',
        'Colour temperature',
        [Math.min(...range), Math.max(...range)],
        'K',
      ),
    );
  const scenes = wizScenes(kind, bulb.config.moduleName);
  if (scenes.length > 0)
    result.push({
      key: 'light_effect',
      label: 'Light effect',
      access: 'read_write',
      value: { kind: 'enum', options: [...scenes] },
    });
  return result;
}
const KIND_NAMES: Readonly<Record<WizBulbClass, string>> = {
  rgb: 'WiZ colour light',
  tunable: 'WiZ white light',
  dimmable: 'WiZ dimmable light',
  unknown: 'WiZ light',
};
const MAC_TAIL_DIGITS = 4;

function wizName(bulb: WizSaved): string {
  const kind = KIND_NAMES[wizBulbClass(bulb.config.moduleName)];
  return `${kind} ${bulb.mac.slice(-MAC_TAIL_DIGITS).toUpperCase()}`;
}

export function wizDevice(bulb: WizSaved, online: boolean): DiscoveredDevice {
  const capabilities = wizCapabilities(bulb);
  return {
    provider: 'local',
    externalId: wizExternalId(bulb.mac),
    parentExternalId: null,
    kind: 'light',
    name: wizName(bulb),
    model: bulb.config.moduleName ?? 'WiZ light',
    manufacturer: 'WiZ',
    room: null,
    online,
    capabilities,
    details: {
      pluginId: 'wiz',
      firmware: bulb.config.fwVersion ?? null,
      minimumBrightness: capabilities.some((capability) => capability.key === 'brightness')
        ? WIZ_MIN_BRIGHTNESS
        : null,
      colorTemperatureRange: temperatureRange(bulb.config) ?? null,
    },
  };
}
export function wizReadings(bulb: WizSaved): ReadonlyMap<CapabilityKey, JsonValue> {
  const pilot = bulb.pilot;
  const values = new Map<CapabilityKey, JsonValue>();
  if (pilot.state !== undefined) values.set('power', pilot.state);
  if (pilot.dimming !== undefined) values.set('brightness', pilot.dimming);
  if (pilot.temp !== undefined && pilot.temp > 0) {
    values.set('color_temperature', pilot.temp);
    values.set('color', null);
  } else if (pilot.r !== undefined && pilot.g !== undefined && pilot.b !== undefined) {
    values.set('color', rgbChannelsToHsv({ r: pilot.r, g: pilot.g, b: pilot.b }));
    values.set('color_temperature', null);
  }
  const scene = Object.entries(WIZ_SCENES).find(([, id]) => id === pilot.sceneId)?.[0];
  values.set('light_effect', scene ?? null);
  const supported = new Set(wizCapabilities(bulb).map((capability) => capability.key));
  return new Map([...values].filter(([key]) => supported.has(key)));
}
export function wizCommand(
  bulb: WizSaved,
  command: DeviceCommand,
): Readonly<Record<string, JsonValue>> {
  const capability = wizCapabilities(bulb).find((entry) => entry.key === command.capability);
  if (capability === undefined)
    throw new CommandRefusedError(
      command.capability,
      'this WiZ light does not support that control',
    );
  const value = checkValue(capability.value, command.value);
  const key = z
    .enum(['power', 'brightness', 'color_temperature', 'color', 'light_effect'])
    .parse(command.capability);
  switch (key) {
    case 'power':
      return { state: z.boolean().parse(value) };
    case 'brightness':
      return { dimming: z.number().parse(value) };
    case 'color_temperature':
      return { temp: z.number().parse(value) };
    case 'color':
      return { ...hsvToRgbChannels(HSV_COLOR.parse(value)) };
    case 'light_effect':
      return { sceneId: z.number().parse(WIZ_SCENES[z.string().parse(value)]) };
  }
}
