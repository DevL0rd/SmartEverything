import {
  LAUNDRY_PROGRAMS,
  laundryCommands,
  laundryStartPlan,
  presentDevice,
  type CapabilityKey,
  type LaundryDraft,
  type StepV2,
} from '@smarteverything/domain';
import { newId } from './blanks';
import type { DeviceLike } from './capability-choices';

type SetStep = Extract<StepV2, { do: 'set' }>;

const DEFAULT_PROGRAM_RAW = 'ECO4060';

type LaundryKeys = ReadonlyMap<string, CapabilityKey>;

export interface LaundryEntry {
  readonly device: DeviceLike;
  readonly keys: LaundryKeys;
}

export function laundryEntries(
  devices: readonly DeviceLike[],
  needs: readonly string[],
): LaundryEntry[] {
  return devices.flatMap((device) => {
    const presentation = presentDevice(device);
    if (presentation.family !== 'laundry') {
      return [];
    }
    const keys = new Map<string, CapabilityKey>(
      presentation.capabilities.flatMap((presented) =>
        presented.role === null ? [] : [[presented.role, presented.capability.key] as const],
      ),
    );
    return needs.every((role) => keys.has(role)) ? [{ device, keys }] : [];
  });
}

export function defaultProgramDraft(): LaundryDraft {
  const program = LAUNDRY_PROGRAMS.find((entry) => entry.raw === DEFAULT_PROGRAM_RAW);
  if (program === undefined) {
    throw new Error(`The washer program ${DEFAULT_PROGRAM_RAW} is missing from LAUNDRY_PROGRAMS.`);
  }
  return { program: program.raw };
}

export function runProgramSteps({ device, keys }: LaundryEntry, draft: LaundryDraft): SetStep[] {
  const commands = laundryCommands(laundryStartPlan(draft, {}), (role) => keys.get(role));
  return commands.map((command) => ({
    do: 'set',
    id: newId(),
    target: { device: device.id },
    control: command.capability,
    to: command.value,
  }));
}
