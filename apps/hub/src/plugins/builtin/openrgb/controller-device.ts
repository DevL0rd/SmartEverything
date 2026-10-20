import type {
  CapabilityKey,
  DeviceCapability,
  DiscoveredDevice,
  JsonValue,
} from '@smarteverything/domain';
import type { Look } from './colour-math';
import { activeModeOf, takesColour, takesLedColours } from './modes';
import type { OpenRgbController } from './transport';

export const OPENRGB_DRIVER_ID = 'openrgb';
const OPENRGB_MANUFACTURER = 'OpenRGB';
export const MIN_BRIGHTNESS = 1;
const MAX_BRIGHTNESS = 100;
const ID_SEPARATOR = '-';
const NON_ID_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_SEPARATORS = /^-+|-+$/g;

export interface LightUnit {
  readonly externalId: string;
  readonly parentExternalId: string | null;
  readonly controller: string;
  readonly zone: number | null;
  readonly name: string;
  readonly start: number;
  readonly count: number;
}

export interface UnitState {
  readonly on: boolean;
  readonly look: Look;
}

export interface UnitSnapshot {
  readonly unit: LightUnit;
  readonly info: OpenRgbController;
  readonly state: UnitState;
  readonly effect: string | null;
  readonly online: boolean;
  readonly at: string;
}

function slug(parts: readonly string[]): string {
  return parts
    .join(ID_SEPARATOR)
    .toLowerCase()
    .replace(NON_ID_CHARACTERS, ID_SEPARATOR)
    .replace(EDGE_SEPARATORS, '');
}

export function controllerIds(controllers: readonly OpenRgbController[]): readonly string[] {
  const seen = new Map<string, number>();
  return controllers.map((controller) => {
    const base = slug([
      controller.vendor ?? '',
      controller.name,
      controller.serial.length > 0 ? controller.serial : controller.location,
    ]);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${OPENRGB_DRIVER_ID}:${count === 1 ? base : `${base}${ID_SEPARATOR}${String(count)}`}`;
  });
}

export function unitsOf(id: string, controller: OpenRgbController): readonly LightUnit[] {
  const whole: LightUnit = {
    externalId: id,
    parentExternalId: null,
    controller: id,
    zone: null,
    name: controller.name,
    start: 0,
    count: controller.colors.length,
  };
  if (controller.zones.length < 2 || !controller.modes.some(takesLedColours)) {
    return [whole];
  }
  let start = 0;
  const zones = controller.zones.map((zone, index): LightUnit => {
    const unit: LightUnit = {
      externalId: `${id}${ID_SEPARATOR}zone${ID_SEPARATOR}${String(index)}`,
      parentExternalId: id,
      controller: id,
      zone: index,
      name: `${controller.name} ${zone.name}`,
      start,
      count: zone.ledsCount,
    };
    start += zone.ledsCount;
    return unit;
  });
  return [whole, ...zones];
}

export function unitCapabilities(info: OpenRgbController, unit: LightUnit): DeviceCapability[] {
  const capabilities: DeviceCapability[] = [];
  const colourable = info.modes.some(unit.zone === null ? takesColour : takesLedColours);
  if (colourable) {
    capabilities.push(
      { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
      {
        key: 'brightness',
        label: 'Brightness',
        access: 'read_write',
        value: { kind: 'number', min: MIN_BRIGHTNESS, max: MAX_BRIGHTNESS, step: 1, unit: '%' },
      },
      { key: 'color', label: 'Colour', access: 'read_write', value: { kind: 'color' } },
    );
  }
  if (unit.zone === null && info.modes.length > 0) {
    capabilities.push({
      key: 'light_effect',
      label: 'Light effect',
      access: 'read_write',
      value: { kind: 'enum', options: info.modes.map((mode) => mode.name) },
    });
  }
  return capabilities;
}

export function describeUnit(snapshot: UnitSnapshot): DiscoveredDevice {
  const { unit, info } = snapshot;
  return {
    provider: 'local',
    externalId: unit.externalId,
    parentExternalId: unit.parentExternalId,
    kind: 'light',
    name: unit.name,
    model: info.name,
    manufacturer:
      info.vendor !== undefined && info.vendor.length > 0 ? info.vendor : OPENRGB_MANUFACTURER,
    room: null,
    online: snapshot.online,
    capabilities: unitCapabilities(info, unit),
    details: {
      pluginId: OPENRGB_DRIVER_ID,
      ledCount: unit.count,
      zone: unit.zone,
      modes: info.modes.map((mode) => mode.name),
    },
  };
}

export function unitReadings(snapshot: UnitSnapshot): ReadonlyMap<CapabilityKey, JsonValue> | null {
  if (!snapshot.online) {
    return null;
  }
  const supported = new Set(
    unitCapabilities(snapshot.info, snapshot.unit).map((entry) => entry.key),
  );
  const { state, effect } = snapshot;
  const readings = new Map<CapabilityKey, JsonValue>([
    ['power', state.on],
    ['brightness', state.look.brightness],
    [
      'color',
      { hue: state.look.hue, saturation: state.look.saturation, value: state.look.brightness },
    ],
    ['light_effect', effect],
  ]);
  return new Map([...readings].filter(([key]) => supported.has(key)));
}

export function effectOf(info: OpenRgbController): string | null {
  return activeModeOf(info)?.name ?? null;
}
