import type { BuiltinFunction } from './build';
import { APPLIANCE_NOTICE, SPEAK_OR_PUSH } from './notices';
import { AVERAGE_IN_ROOM, LIGHTS_OFF_AFTER, TIMED_DEVICES, WEATHER_LOOK } from './home';
import { PRESENCE_LIGHTS } from './presence';
import { CAMERA_CHECK } from './camera-check';
import { ASK_THEN_ACT, DOORBELL_FLASH, LEAVE_HOME_CHECK, WAKE_UP_LIGHT } from './v11-home';
import { LONG_PRESS_RESET, PRESS_CYCLE_BRIGHTNESS } from './press-cycle';

export type { BuiltinFunction } from './build';
export {
  APPLIANCE_NOTICE,
  SPEAK_OR_PUSH,
  AVERAGE_IN_ROOM,
  LIGHTS_OFF_AFTER,
  TIMED_DEVICES,
  WEATHER_LOOK,
  PRESENCE_LIGHTS,
  LONG_PRESS_RESET,
  PRESS_CYCLE_BRIGHTNESS,
  CAMERA_CHECK,
  DOORBELL_FLASH,
  LEAVE_HOME_CHECK,
  WAKE_UP_LIGHT,
  ASK_THEN_ACT,
};

export const BUILTIN_FUNCTIONS: readonly BuiltinFunction[] = [
  PRESS_CYCLE_BRIGHTNESS,
  LONG_PRESS_RESET,
  PRESENCE_LIGHTS,
  SPEAK_OR_PUSH,
  APPLIANCE_NOTICE,
  TIMED_DEVICES,
  AVERAGE_IN_ROOM,
  WEATHER_LOOK,
  LIGHTS_OFF_AFTER,
  DOORBELL_FLASH,
  WAKE_UP_LIGHT,
  LEAVE_HOME_CHECK,
  ASK_THEN_ACT,
  CAMERA_CHECK,
];

const BY_ID: ReadonlyMap<string, BuiltinFunction> = new Map(
  BUILTIN_FUNCTIONS.map((entry) => [entry.id, entry]),
);

export function builtinFunction(id: string): BuiltinFunction | undefined {
  return BY_ID.get(id);
}
