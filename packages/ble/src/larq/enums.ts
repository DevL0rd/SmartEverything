import {
  BOTTLE_FAULT_TYPES,
  BOTTLE_QUIET_STATES,
  BOTTLE_REMINDER_STATES,
  BOTTLE_TRIGGERS,
  BOTTLE_UV_MODES,
  BOTTLE_UI_STATES,
} from '@smarteverything/domain';

export const UI_STATES = BOTTLE_UI_STATES;

export const TRIGGER_TYPES = BOTTLE_TRIGGERS;

export const UV_LOG_MODES = BOTTLE_UV_MODES;

export const FAULT_TYPES = BOTTLE_FAULT_TYPES;

export const REMINDER_STATES = BOTTLE_REMINDER_STATES;

export const QUIET_STATES = BOTTLE_QUIET_STATES;

export const TOF_DISPLAY_MODES = ['off', 'on', 'event'] as const;

export const POWER_SAVING_MODES = ['on', 'off'] as const;

export type UvCommand = keyof typeof UV_CODES;

export function nameOfCode(names: readonly string[], code: number): string {
  return names[code] ?? `unknown_${String(code)}`;
}

export const REMINDER_WRITE_CODES = { off: 0, interval_fixed: 1 } as const;

export const QUIET_CODES = { off: 0, on: 1, auto: 2 } as const;

export const UV_CODES = { maintenance: 0, normal: 1, adventure: 2, stop: 3 } as const;
