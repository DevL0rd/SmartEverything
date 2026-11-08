import {
  presentDevice,
  type OptionSourceId,
  type PresentedCapability,
  CLIMATE_CONTROLS,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import {
  named,
  ready,
  textOf,
  unavailable,
  type HomeData,
  type OptionContext,
  type OptionResult,
  type OptionRow,
} from './option-types';

export function computersOf(devices: readonly Device[]): readonly OptionRow[] {
  return devices
    .filter((device) => device.kind === 'computer')
    .map((device) => ({ id: device.id, label: device.label }));
}

export function phonesOf(devices: readonly Device[]): readonly OptionRow[] {
  return devices
    .filter((device) => device.kind === 'phone')
    .map((device) => ({ id: device.id, label: device.label }));
}

function canDo(device: Device, capabilities: readonly string[]): boolean {
  return capabilities.every((needed) => device.capabilities.some((held) => held.key === needed));
}

export function devicesOfTarget(home: HomeData, id: string): readonly Device[] {
  const device = home.devices.find((candidate) => candidate.id === id);
  if (device !== undefined) return [device];
  const group = home.groups.find((candidate) => candidate.id === id);
  if (group !== undefined) {
    const members = new Set(group.device_ids);
    return home.devices.filter((candidate) => members.has(candidate.id));
  }
  return home.devices.filter((candidate) => candidate.room_id === id);
}

export function devicesOfTargets(home: HomeData, ids: readonly string[]): readonly Device[] {
  const found = new Map(ids.flatMap((id) => devicesOfTarget(home, id)).map((d) => [d.id, d]));
  return [...found.values()];
}

function targetRows(
  home: HomeData,
  capabilities: readonly string[],
  devices: readonly Device[],
): readonly OptionRow[] {
  const capable = new Set(devices.map((device) => device.id));
  const reaches = (id: string): boolean =>
    capabilities.length === 0 || devicesOfTarget(home, id).some((d) => capable.has(d.id));
  return [
    ...devices.map((device) => ({ id: device.id, label: device.label })),
    ...named(home.rooms).filter((row) => reaches(row.id)),
    ...named(home.groups).filter((row) => reaches(row.id)),
  ];
}

export function referenceOptions(
  home: HomeData,
  of: string,
  capabilities: readonly string[],
): readonly OptionRow[] {
  const devices = home.devices.filter((device) => canDo(device, capabilities));
  const labelled = (device: Device): OptionRow => ({ id: device.id, label: device.label });
  if (of === 'device') return devices.map(labelled);
  if (of === 'computer') return computersOf(devices);
  if (of === 'phone') return phonesOf(devices);
  if (of === 'camera') return devices.filter((d) => d.kind === 'camera').map(labelled);
  if (of === 'target') return targetRows(home, capabilities, devices);
  return [];
}

function referenceOf(presented: PresentedCapability): string {
  return presented.role ?? presented.key;
}

function presentedOf(devices: readonly Device[]): readonly PresentedCapability[] {
  return devices.flatMap((device) => presentDevice(device).capabilities);
}

function isShown(presented: PresentedCapability): boolean {
  return presented.tier !== 'hidden' && presented.tier !== 'diagnostic';
}

function isWritable(presented: PresentedCapability): boolean {
  return isShown(presented) && presented.writable && presented.capability.value.kind !== 'action';
}

function isAction(presented: PresentedCapability): boolean {
  return isShown(presented) && presented.writable && presented.capability.value.kind === 'action';
}

function controlRows(
  devices: readonly Device[],
  keep: (presented: PresentedCapability) => boolean,
): readonly OptionRow[] {
  const found = new Map<string, OptionRow>();
  for (const presented of presentedOf(devices).filter(keep)) {
    const id = referenceOf(presented);
    if (!found.has(id)) found.set(id, { id, label: presented.label, detail: presented.groupLabel });
  }
  return [...found.values()];
}

function optionRows(
  devices: readonly Device[],
  isWanted: (presented: PresentedCapability) => boolean,
): readonly OptionRow[] {
  const found = new Map<string, OptionRow>();
  for (const presented of presentedOf(devices).filter(isWanted)) {
    for (const option of presented.options) {
      found.set(option.value, { id: option.value, label: option.label });
    }
  }
  return [...found.values()];
}

export function roleRows(devices: readonly Device[]): readonly OptionRow[] {
  const roles = new Map<string, OptionRow>();
  for (const presented of presentedOf(devices).filter(isShown)) {
    if (presented.role !== null)
      roles.set(presented.role, { id: presented.role, label: presented.label });
  }
  return [...roles.values()];
}

export type DeviceResolver = (devices: readonly Device[], context: OptionContext) => OptionResult;

function enumValues(devices: readonly Device[], context: OptionContext): OptionResult {
  const control = textOf(context.values['control']);
  if (control === '') return unavailable('Pick the control first');
  return ready(optionRows(devices, (p) => referenceOf(p) === control || p.key === control));
}

function settingOptions(key: string, missing: string): DeviceResolver {
  return (devices) => {
    const rows = optionRows(devices, (p) => p.key === key || p.role === key);
    return rows.length === 0 ? unavailable(missing) : ready(rows);
  };
}

function climateOptions(controls: readonly string[]): DeviceResolver {
  return (devices) =>
    ready(
      optionRows(
        devices,
        (p) => controls.includes(p.key) || (p.role !== null && controls.includes(p.role)),
      ),
    );
}

export const DEVICE_RESOLVERS: Partial<Record<OptionSourceId, DeviceResolver>> = {
  'device.controls': (devices) => ready(controlRows(devices, isShown)),
  'device.writable_controls': (devices) => ready(controlRows(devices, isWritable)),
  'device.actions': (devices) => ready(controlRows(devices, isAction)),
  'device.enum_values': enumValues,
  'tv.inputs': settingOptions('input_source', 'The TV offers no inputs'),
  'tv.apps': settingOptions('app_launch', 'The TV offers no apps'),
  'tv.keys': settingOptions('remote_key', 'The TV offers no remote buttons'),
  'tv.picture_modes': settingOptions('picture_mode', 'The TV offers no picture modes'),
  'tv.sound_modes': settingOptions('sound_mode', 'The TV offers no sound modes'),
  'camera.presets': settingOptions('ptz_preset', 'The camera has no saved positions'),
  'camera.night_vision': settingOptions('night_vision', 'The cameras have no night vision setting'),
  'light.effects': (devices) => ready(optionRows(devices, (p) => p.key === 'light_effect')),
  'climate.modes': climateOptions(CLIMATE_CONTROLS.mode),
  'climate.fan_modes': climateOptions(CLIMATE_CONTROLS.fan),
  'climate.swing_modes': climateOptions(CLIMATE_CONTROLS.swing),
};
