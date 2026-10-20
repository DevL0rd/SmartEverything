import {
  BRUSH_INTENSITIES,
  SONICARE_MODES,
  CommandRefusedError,
  type BrushStep,
  type DeviceCommand,
} from '@smarteverything/domain';
import {
  KEY,
  intensityWriteStep,
  modeWriteStep,
  readStep,
  routineIdOf,
  settingsWriteStep,
  withSetting,
  type SETTING_BITS,
} from '@smarteverything/ble';
import type { CommandContext, Writes } from '../toothbrush/brand';
import type { DeviceState } from '../toothbrush/fleet';
import type { BrushState } from './state';
import { availableModes } from './capabilities';
import { effectiveIdentity, entryConfigOf, entryProfileOf, entrySettingsOf } from './config';

type Setting = keyof typeof SETTING_BITS;

const SETTING_OF: Readonly<Record<string, Setting>> = {
  brush_feedback_pressure: 'pressure',
  brush_feedback_scrubbing: 'scrubbing',
  brush_adaptive_intensity: 'adaptive',
};

const REASON_BRUSHSYNC = 'This handle is changed on the handle itself, not from SmartEverything.';

const REASON_CONSENT =
  'The owner has not allowed SmartEverything to change brush settings. Turn it on in the toothbrush settings.';

export function sonicareWrites(state: DeviceState): Writes {
  const profile = entryProfileOf(state.entry);
  const settings = entrySettingsOf(state.entry);
  if (!profile.writes) {
    return { allowed: false, reason: REASON_BRUSHSYNC };
  }
  return settings.consent
    ? { allowed: true, reason: null }
    : { allowed: false, reason: REASON_CONSENT };
}

function refuse(command: DeviceCommand, reason: string): CommandRefusedError {
  return new CommandRefusedError(command.capability, reason);
}

function textOf(command: DeviceCommand): string {
  if (typeof command.value !== 'string') {
    throw refuse(command, 'it needs a choice');
  }
  return command.value;
}

function flagOf(command: DeviceCommand): boolean {
  if (typeof command.value !== 'boolean') {
    throw refuse(command, 'it needs on or off');
  }
  return command.value;
}

function assertWritable(command: DeviceCommand, state: DeviceState): void {
  const writes = sonicareWrites(state);
  if (!writes.allowed) {
    throw refuse(command, writes.reason ?? 'the handle does not accept changes');
  }
  const { activity } = state.runtime.state;
  if (activity === 'brushing' || activity === 'paused') {
    throw refuse(command, 'the brush is in use; change it after brushing');
  }
  if (state.link.phase !== 'linked') {
    throw refuse(command, 'the brush is asleep: lift it and try again');
  }
}

function modeSteps(command: DeviceCommand, state: DeviceState): BrushStep[] {
  const mode = SONICARE_MODES.find((candidate) => candidate === textOf(command));
  const profile = entryProfileOf(state.entry);
  const identity = effectiveIdentity(
    entryConfigOf(state.entry).identity,
    entrySettingsOf(state.entry),
  );
  if (mode === undefined || !availableModes(profile, identity).includes(mode)) {
    throw refuse(command, 'this handle does not offer that mode');
  }
  return [modeWriteStep(profile, routineIdOf(mode)), readStep(profile, KEY.routineIds)];
}

function intensitySteps(command: DeviceCommand, state: DeviceState): BrushStep[] {
  const index = BRUSH_INTENSITIES.findIndex((candidate) => candidate === textOf(command));
  const profile = entryProfileOf(state.entry);
  if (index < 0) {
    throw refuse(command, 'it needs low, medium or high');
  }
  return [intensityWriteStep(profile, index), readStep(profile, KEY.intensity)];
}

function settingSteps(
  command: DeviceCommand,
  state: DeviceState,
  bits: number | null,
  setting: Setting,
): BrushStep[] {
  if (bits === null) {
    throw refuse(
      command,
      'the handle settings have not been read yet; wake the brush and try again',
    );
  }
  const profile = entryProfileOf(state.entry);
  return [
    settingsWriteStep(profile, withSetting(bits, setting, flagOf(command))),
    readStep(profile, KEY.settings),
  ];
}

function stepsOf(command: DeviceCommand, state: DeviceState, brush: BrushState): BrushStep[] {
  assertWritable(command, state);
  const setting = SETTING_OF[command.capability];
  if (setting !== undefined) {
    return settingSteps(command, state, brush.extras.settingsBits, setting);
  }
  if (command.capability === 'brush_mode') {
    return modeSteps(command, state);
  }
  if (command.capability === 'brush_intensity') {
    return intensitySteps(command, state);
  }
  throw refuse(command, 'the toothbrush cannot change this');
}

export function sonicareCommand(
  brush: BrushState,
  command: DeviceCommand,
  context: CommandContext,
): BrushStep[] {
  if (command.capability in SETTING_OF && !context.owner()) {
    throw refuse(command, 'only the owner changes the feedback settings stored on the handle');
  }
  return stepsOf(command, context.state, brush);
}
