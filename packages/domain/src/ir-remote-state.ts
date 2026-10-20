import { z } from 'zod';
import { somethingToChange } from './api/primitives';
import { buttonLabel, roleOf, type RemoteRole } from './remote-keys';

export const IR_TEMP_RANGE = { min: 16, max: 30 } as const;
export const IR_TEMP_START = 24;
export const IR_SPEED_STEPS = 5;
export const IR_RECENT_WINDOW_MS = 86_400_000;
const AC_MODES = ['Cool', 'Heat', 'Dry', 'Fan', 'Auto'] as const;

const MOMENT = z.iso.datetime({ offset: true });

const ON = z
  .boolean()
  .describe('Whether the appliance is on, as last sent or corrected; IR cannot report back');
const TEMP = z
  .int()
  .min(IR_TEMP_RANGE.min)
  .max(IR_TEMP_RANGE.max)
  .describe('The air conditioner target in °C, counted from the keys sent');
const MODE = z.string().min(1).describe('The mode last chosen, such as Cool or Heat');
const SPEED = z
  .int()
  .min(1)
  .max(IR_SPEED_STEPS)
  .describe(`The fan speed step from 1 to ${String(IR_SPEED_STEPS)}, counted from the keys sent`);
const MUTED = z.boolean().describe('Whether the sound is muted, as last sent');
const CHECK_DEVICE = z
  .string()
  .min(1)
  .describe(
    'A device with a power reading (a smart plug) whose draw confirms whether the appliance is on; ids come from find_devices',
  );

export const IR_REMOTE_STATE = z.strictObject({
  on: ON.nullable(),
  temp: TEMP.nullable(),
  mode: MODE.nullable(),
  speed: SPEED.nullable(),
  muted: MUTED.nullable(),
  sentKey: z.string().min(1).nullable().describe('The last key sent to it'),
  sentAt: MOMENT.nullable().describe('When the last key was sent'),
  recent: z.array(MOMENT).describe('When keys were sent in the last 24 hours'),
  checkDeviceId: CHECK_DEVICE.nullable(),
});

export type IrRemoteState = z.infer<typeof IR_REMOTE_STATE>;

export const IR_REMOTE_STATES = z.record(z.string().min(1), IR_REMOTE_STATE);

export type IrRemoteStates = z.infer<typeof IR_REMOTE_STATES>;

export const IR_REMOTE_CHANGE = somethingToChange({
  on: ON.nullable(),
  temp: TEMP.nullable(),
  mode: MODE.nullable(),
  speed: SPEED.nullable(),
  muted: MUTED.nullable(),
  checkDeviceId: CHECK_DEVICE.nullable(),
});

export type IrRemoteChange = z.infer<typeof IR_REMOTE_CHANGE>;

export const EMPTY_IR_REMOTE_STATE: IrRemoteState = {
  on: null,
  temp: null,
  mode: null,
  speed: null,
  muted: null,
  sentKey: null,
  sentAt: null,
  recent: [],
  checkDeviceId: null,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nextMode(current: string | null): string {
  const at = AC_MODES.findIndex((mode) => mode === current);
  return AC_MODES[at + 1] ?? AC_MODES[0];
}

function warmer(state: IrRemoteState, step: number): Partial<IrRemoteState> {
  return {
    temp: clamp((state.temp ?? IR_TEMP_START) + step, IR_TEMP_RANGE.min, IR_TEMP_RANGE.max),
  };
}

function faster(state: IrRemoteState, step: number): Partial<IrRemoteState> {
  return state.speed === null && step < 0
    ? {}
    : { speed: clamp((state.speed ?? 0) + step, 1, IR_SPEED_STEPS) };
}

type Change = (state: IrRemoteState) => Partial<IrRemoteState>;

const CHANGES: Readonly<Partial<Record<RemoteRole, Change>>> = {
  power: (state) => ({ on: state.on !== true }),
  temp_up: (state) => warmer(state, 1),
  temp_down: (state) => warmer(state, -1),
  speed_up: (state) => faster(state, 1),
  speed_down: (state) => faster(state, -1),
  speed_cycle: (state) => ({ speed: ((state.speed ?? 0) % IR_SPEED_STEPS) + 1 }),
  mute: (state) => ({ muted: state.muted !== true }),
  mode: (state) => ({ mode: nextMode(state.mode) }),
};

function changed(
  state: IrRemoteState,
  key: string,
  modes: readonly string[],
): Partial<IrRemoteState> {
  if (modes.includes(key)) {
    return { mode: buttonLabel(key) };
  }
  const role = roleOf(key);
  return role === undefined ? {} : (CHANGES[role]?.(state) ?? {});
}

export function irRecentSends(recent: readonly string[], now: string): readonly string[] {
  const from = Date.parse(now) - IR_RECENT_WINDOW_MS;
  return recent.filter((at) => Date.parse(at) >= from);
}

export function afterIrSend(
  state: IrRemoteState,
  key: string,
  modes: readonly string[],
  now: string,
): IrRemoteState {
  return {
    ...state,
    ...changed(state, key, modes),
    sentKey: key,
    sentAt: now,
    recent: [...irRecentSends(state.recent, now), now],
  };
}

export function withIrChange(state: IrRemoteState, change: IrRemoteChange): IrRemoteState {
  return {
    ...state,
    on: change.on === undefined ? state.on : change.on,
    temp: change.temp === undefined ? state.temp : change.temp,
    mode: change.mode === undefined ? state.mode : change.mode,
    speed: change.speed === undefined ? state.speed : change.speed,
    muted: change.muted === undefined ? state.muted : change.muted,
    checkDeviceId: change.checkDeviceId === undefined ? state.checkDeviceId : change.checkDeviceId,
  };
}
