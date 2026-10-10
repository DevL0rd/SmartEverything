import type { JsonValue } from '@smarteverything/domain';
import { levelControl, numberDescriptor, toggle, type NumberRange } from './mapper-factories';
import {
  attributeValue,
  call,
  colorOf,
  finiteNumber,
  isJsonRecord,
  readNumber,
  numberOf,
  type CapabilityMapper,
  type CommandCall,
  type ComponentView,
} from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

export const PERCENT: NumberRange = { min: 0, max: 100, step: 1 };

const COLOR_TEMPERATURE_LIMITS: NumberRange = { min: 1, max: 30000, step: 1 };

const DEGREES_PER_HUE_PERCENT = 3.6;

const FULL_VALUE = 100;

function twoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function rangeFrom(value: JsonValue | undefined, fallback: NumberRange): NumberRange {
  if (!isJsonRecord(value)) {
    return fallback;
  }
  const min = finiteNumber(value['minimum']);
  const max = finiteNumber(value['maximum']);
  const step = finiteNumber(value['step']);
  if (min === undefined || max === undefined || min > max) {
    return fallback;
  }
  return { min, max, step: step === undefined || step <= 0 ? fallback.step : step };
}

function readColor(dimmable: boolean): (status: ComponentStatus) => JsonValue | undefined {
  return (status) => {
    const hue = finiteNumber(attributeValue(status, 'colorControl', 'hue'));
    const saturation = finiteNumber(attributeValue(status, 'colorControl', 'saturation'));
    const value = dimmable
      ? finiteNumber(attributeValue(status, 'switchLevel', 'level'))
      : FULL_VALUE;
    if (hue === undefined || saturation === undefined || value === undefined) {
      return undefined;
    }
    return { hue: twoDecimals(hue * DEGREES_PER_HUE_PERCENT), saturation, value };
  };
}

const colorControlMapper: CapabilityMapper = {
  capability: 'colorControl',
  attributes: ['hue', 'saturation', 'color'],
  commands: ['setColor', 'setHue', 'setSaturation'],
  map: (view) => {
    const dimmable = view.capabilities.has('switchLevel');
    const hue = { capability: 'colorControl', attribute: 'hue' };
    const saturation = { capability: 'colorControl', attribute: 'saturation' };
    const level = { capability: 'switchLevel', attribute: 'level' };
    return [
      {
        key: 'color',
        access: 'read_write',
        value: { kind: 'color' },
        sources: dimmable ? [hue, saturation, level] : [hue, saturation],
        read: readColor(dimmable),
        write: (value): readonly CommandCall[] => {
          const color = colorOf('colorControl', value);
          const hueSaturation = {
            hue: twoDecimals(color.hue / DEGREES_PER_HUE_PERCENT),
            saturation: color.saturation,
          };
          const setColor = call('colorControl', 'setColor', [hueSaturation]);
          return dimmable ? [setColor, call('switchLevel', 'setLevel', [color.value])] : [setColor];
        },
      },
    ];
  },
};

const colorTemperatureMapper: CapabilityMapper = {
  capability: 'colorTemperature',
  attributes: ['colorTemperature', 'colorTemperatureRange'],
  commands: ['setColorTemperature'],
  map: (view: ComponentView) => {
    const range = rangeFrom(
      attributeValue(view.status, 'colorTemperature', 'colorTemperatureRange'),
      COLOR_TEMPERATURE_LIMITS,
    );
    return [
      {
        key: 'color_temperature',
        access: 'read_write',
        value: numberDescriptor(view, {
          capability: 'colorTemperature',
          attribute: 'colorTemperature',
          range,
          unit: 'K',
        }),
        sources: [{ capability: 'colorTemperature', attribute: 'colorTemperature' }],
        read: readNumber('colorTemperature', 'colorTemperature'),
        write: (value) => [
          call('colorTemperature', 'setColorTemperature', [numberOf('colorTemperature', value)]),
        ],
      },
    ];
  },
};

export function lightingMappers(): readonly CapabilityMapper[] {
  return [
    toggle({
      capability: 'switch',
      attribute: 'switch',
      key: 'power',
      onValue: 'on',
      onCommand: 'on',
      offCommand: 'off',
      alsoCovers: [],
    }),
    levelControl({
      capability: 'switchLevel',
      attribute: 'level',
      key: 'brightness',
      command: 'setLevel',
      range: PERCENT,
      unit: '%',
    }),
    colorControlMapper,
    colorTemperatureMapper,
  ];
}
