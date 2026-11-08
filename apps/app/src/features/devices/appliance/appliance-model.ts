import { z } from 'zod';
import { keyFor, roleOf } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { remoteKeysOf } from '../model/remote-layout';
import { categoryOfLearned, SUGGESTED_BUTTONS } from '../remote/remote-category';

export const BUTTONS_SECTION = 'buttons';

const APPLIANCE_DETAILS = z.object({
  irApplianceId: z.string().min(1),
  blasterId: z.string().min(1).nullable(),
  category: z.string().min(1),
});

export interface Appliance {
  readonly id: string;
  readonly blasterId: string | null;
  readonly category: string;
}

export function applianceOf(device: Device): Appliance | null {
  if (device.provider !== 'local' || !('irApplianceId' in device.details)) {
    return null;
  }
  const details = APPLIANCE_DETAILS.parse(device.details);
  return { id: details.irApplianceId, blasterId: details.blasterId, category: details.category };
}

export function isAppliance(device: Device): boolean {
  return applianceOf(device) !== null;
}

const CLIMATE_CONTROL_BUTTONS: readonly string[] = ['Power', 'Temp up', 'Temp down', 'Mode'];
const CLIMATE_BUTTONS: readonly string[] = [...CLIMATE_CONTROL_BUTTONS, 'Fan speed'];

export interface ApplianceButton {
  readonly name: string;
  readonly learned: string | null;
}

function learnedAs(name: string, keys: readonly string[]): string | null {
  const role = roleOf(name);
  const wanted = name.trim().toLowerCase();
  const found =
    role === undefined
      ? keys.find((key) => key.trim().toLowerCase() === wanted)
      : keyFor(keys, role);
  return found ?? null;
}

function expectedButtons(device: Device, category: string): readonly string[] {
  return device.kind === 'air_conditioner'
    ? CLIMATE_BUTTONS
    : SUGGESTED_BUTTONS[categoryOfLearned(category)];
}

export function applianceButtons(device: Device, category: string): readonly ApplianceButton[] {
  const keys = remoteKeysOf(device.capabilities);
  const expected = expectedButtons(device, category).map((name) => ({
    name,
    learned: learnedAs(name, keys),
  }));
  const matched = new Set(expected.map((button) => button.learned));
  const extra = keys.filter((key) => !matched.has(key)).map((key) => ({ name: key, learned: key }));
  return [...expected, ...extra];
}

export function missingControlButtons(device: Device): readonly string[] {
  if (device.kind !== 'air_conditioner') {
    return [];
  }
  const keys = remoteKeysOf(device.capabilities);
  return CLIMATE_CONTROL_BUTTONS.filter((name) => learnedAs(name, keys) === null);
}

function spokenList(names: readonly string[]): string {
  const last = names.at(-1);
  if (names.length < 2 || last === undefined) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

export function controlNote(missing: readonly string[]): string | null {
  return missing.length === 0
    ? null
    : `Learn ${spokenList(missing)} to control this air conditioner`;
}

function sends(device: Device): boolean {
  return device.capabilities.some(
    (capability) => capability.key === 'ir_send' && capability.access !== 'read',
  );
}

export function blasterChoices(
  devices: readonly Device[],
  current: string | null,
): readonly Device[] {
  return devices.filter((device) => device.id !== current && sends(device));
}

export function offlineCause(appliance: Appliance, blaster: Device | null): string {
  if (appliance.blasterId === null || blaster === null) {
    return 'Its IR blaster was removed. Choose another blaster to send through.';
  }
  return `${blaster.label} is offline, so nothing can be sent to it.`;
}
