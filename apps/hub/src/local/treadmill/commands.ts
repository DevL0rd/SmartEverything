import {
  SUPPLEMENT_SERVICE,
  SUPPLEMENT_WRITE,
  beltSteps,
  padSteps,
  queryPreferencesFrame,
  settingGetFrame,
  stepOf,
  type BeltAction,
  type PadWrite,
} from '@smarteverything/ble';
import {
  CommandRefusedError,
  PAD_GOAL_KINDS,
  PAD_SENSITIVITIES,
  remoteSpeedVerdict,
  remoteStartVerdict,
  type DeviceCommand,
  type DeviceRow,
  type JsonValue,
  type StartVerdict,
  type Starter,
  type TreadmillPolicy,
  type TreadmillWriteStep,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { DeviceDriver } from '../device-driver';
import { starterOf, type AccessDeps } from './access';
import type { TreadmillActionBroker } from './broker';
import { entrySettingsOf } from './config';
import type { DeviceState, Fleet } from './fleet';
import type { NoStepsGuard } from './guard';
import { INCLINE_SETTLE_MS, runIncline, type InclineIo } from './incline-guard';
import { controlOf } from './plan';
import { TREADMILL_DRIVER } from './config';
import { stopBelt, type StopIo } from './stop';

const RUNNING_WAIT_MS = 15_000;

const STOPS_IN_FLIGHT = new WeakMap<DeviceState, Promise<string>>();

const SUPPLEMENT_QUERY_TARGET = {
  service: SUPPLEMENT_SERVICE,
  characteristic: SUPPLEMENT_WRITE,
  writeType: 'without_response',
} as const;

const LIGHT_BIT = 1 << 3;

class TreadmillCommandFailedError extends Error {
  override readonly name = 'TreadmillCommandFailedError';
}

export interface CommandDeps extends AccessDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly broker: Pick<TreadmillActionBroker, 'run'>;
  readonly guard: NoStepsGuard;
  readonly holderName: (device: DeviceRow) => string | null;
  readonly now: () => Date;
  readonly log: Logger;
}

type Intent =
  | { readonly kind: 'belt'; readonly action: BeltAction }
  | { readonly kind: 'incline'; readonly target: number }
  | { readonly kind: 'pad'; readonly write: PadWrite };

function refuse(command: DeviceCommand, reason: string): CommandRefusedError {
  return new CommandRefusedError(command.capability, reason);
}

function numberOf(command: DeviceCommand): number {
  if (typeof command.value !== 'number') {
    throw refuse(command, 'it needs a number');
  }
  return command.value;
}

function textOf(command: DeviceCommand): string {
  if (typeof command.value !== 'string') {
    throw refuse(command, 'it needs a choice');
  }
  return command.value;
}

function switchOf(command: DeviceCommand): boolean {
  if (typeof command.value !== 'boolean') {
    throw refuse(command, 'it needs on or off');
  }
  return command.value;
}

function goalIntent(command: DeviceCommand, state: DeviceState): Intent {
  const pad = state.runtime.pad;
  if (command.capability === 'belt_goal') {
    const kind = choiceOf(command, PAD_GOAL_KINDS, 'none, distance, calories or time');
    return {
      kind: 'pad',
      write: { key: 'goal', kind, value: kind === 'none' ? 0 : (pad.goalValue ?? 0) },
    };
  }
  return {
    kind: 'pad',
    write: { key: 'goal', kind: pad.goalKind ?? 'distance', value: Math.round(numberOf(command)) },
  };
}

type IntentMaker = (command: DeviceCommand, state: DeviceState) => Intent;

function choiceOf<T extends string>(
  command: DeviceCommand,
  choices: readonly T[],
  words: string,
): T {
  const picked = choices.find((choice) => choice === textOf(command));
  if (picked === undefined) {
    throw refuse(command, `it needs ${words}`);
  }
  return picked;
}

const BELT_COMMANDS = ['start', 'stop', 'pause', 'resume'] as const;

const BELT_MODES_SETTABLE = ['manual', 'auto', 'standby'] as const;

function padWrite(write: PadWrite): Intent {
  return { kind: 'pad', write };
}

const INTENTS: Readonly<Record<string, IntentMaker>> = {
  belt_command: (command) => ({
    kind: 'belt',
    action: { kind: choiceOf(command, BELT_COMMANDS, 'start, stop, pause or resume') },
  }),
  belt_speed: (command) => ({ kind: 'belt', action: { kind: 'speed', kmh: numberOf(command) } }),
  belt_incline: (command) => ({ kind: 'incline', target: numberOf(command) }),
  belt_mode: (command, state) => {
    if (state.runtime.decoder.family !== 'wilink') {
      throw refuse(command, 'this treadmill chooses its mode on its own panel');
    }
    return {
      kind: 'belt',
      action: {
        kind: 'mode',
        mode: choiceOf(command, BELT_MODES_SETTABLE, 'manual, auto or standby'),
      },
    };
  },
  belt_goal: goalIntent,
  belt_goal_value: goalIntent,
  belt_max_speed: (command) => padWrite({ key: 'max_speed', kmh: numberOf(command) }),
  belt_start_speed: (command) => padWrite({ key: 'start_speed', kmh: numberOf(command) }),
  belt_auto_start: (command) => padWrite({ key: 'auto_start', on: switchOf(command) }),
  child_lock: (command) => padWrite({ key: 'child_lock', on: switchOf(command) }),
  buzzer: (command) => padWrite({ key: 'buzzer', on: switchOf(command) }),
  belt_light: (command) => padWrite({ key: 'light', on: switchOf(command) }),
  belt_sensitivity: (command) =>
    padWrite({
      key: 'sensitivity',
      level: choiceOf(command, PAD_SENSITIVITIES, 'high, medium or low'),
    }),
};

function intentOf(command: DeviceCommand, state: DeviceState): Intent {
  const make = INTENTS[command.capability];
  if (make === undefined) {
    throw refuse(command, 'the treadmill cannot change this');
  }
  return make(command, state);
}

function verdictOf(
  policy: TreadmillPolicy,
  starter: Starter,
  action: BeltAction,
  currentKmh: number,
): StartVerdict {
  if (action.kind === 'start' || action.kind === 'resume') {
    return remoteStartVerdict(policy, starter);
  }
  return action.kind === 'speed'
    ? remoteSpeedVerdict(policy, starter, currentKmh, action.kmh)
    : { allowed: true };
}

function assertBeltAllowed(
  command: DeviceCommand,
  state: DeviceState,
  action: BeltAction,
  starter: Starter,
): void {
  const policy = entrySettingsOf(state.entry).policy;
  const { machine } = state.runtime;
  const verdict = verdictOf(policy, starter, action, machine.live.speedKmh ?? 0);
  if (!verdict.allowed) {
    throw refuse(command, verdict.reason);
  }
  const cap = state.runtime.pad.maxSpeedKmh;
  if (action.kind === 'speed' && cap !== undefined && action.kmh > cap) {
    throw refuse(command, `the treadmill is limited to ${String(cap)} km/h in its own settings`);
  }
  if (action.kind === 'mode' && (machine.state === 'running' || machine.state === 'paused')) {
    throw refuse(command, 'change the mode after stopping the belt');
  }
}

async function readyForSpeed(command: DeviceCommand, state: DeviceState): Promise<void> {
  const current = state.runtime.machine.state;
  if (current === 'running' || current === 'paused') {
    return;
  }
  if (current === 'countdown' && (await state.whenRunning(RUNNING_WAIT_MS))) {
    return;
  }
  throw refuse(command, 'the belt is not moving; start it first');
}

type Plain = Exclude<Intent, { readonly kind: 'incline' }>;

function stepsOf(
  deps: CommandDeps,
  device: DeviceRow,
  state: DeviceState,
  intent: Plain,
): TreadmillWriteStep[] {
  const target = controlOf(device, state, deps.now());
  const family = state.runtime.decoder.family;
  if (intent.kind === 'belt') {
    return beltSteps(family, target, intent.action);
  }
  const written = padSteps(family, target, intent.write, state.runtime.supplement.switches ?? 0);
  if (family === 'wilink') {
    return [...written, stepOf(target, queryPreferencesFrame())];
  }
  return intent.write.key === 'light'
    ? [...written, stepOf(SUPPLEMENT_QUERY_TARGET, settingGetFrame())]
    : written;
}

async function send(
  deps: CommandDeps,
  device: DeviceRow,
  state: DeviceState,
  steps: readonly TreadmillWriteStep[],
): Promise<string> {
  const holder = deps.holderOf(device);
  const name = device.display_name ?? device.name;
  if (holder === null || state.link.phase !== 'linked') {
    throw new TreadmillCommandFailedError(
      `${name} is not linked to a phone. Open SmartEverything on a phone near the treadmill and let it connect first.`,
    );
  }
  const startedAt = performance.now();
  const result = await deps.broker.run({ clientId: holder, deviceId: device.id, name }, steps);
  state.recordCommand(Math.round(performance.now() - startedAt), result.ok ? null : result.detail);
  if (!result.ok) {
    throw new TreadmillCommandFailedError(result.detail);
  }
  return result.detail;
}

export async function runTreadmillCommand(
  deps: CommandDeps,
  command: DeviceCommand,
): Promise<JsonValue> {
  const device = deps.store.devices.byExternal('local', command.externalId);
  if (device === undefined) {
    throw refuse(command, 'this treadmill is no longer known to the hub');
  }
  const state = deps.fleet.of(device);
  const intent = intentOf(command, state);
  const starter = starterOf(deps, device, command.commandId);
  if (intent.kind === 'incline') {
    return deliverIncline(deps, command, { device, state, starter }, intent.target);
  }
  if (intent.kind === 'pad') {
    if (!starter.owner) {
      throw refuse(command, 'only the owner changes the settings stored on the treadmill');
    }
  } else {
    assertBeltAllowed(command, state, intent.action, starter);
    if (intent.action.kind === 'speed') {
      await readyForSpeed(command, state);
    }
  }
  const stopping = intent.kind === 'belt' && intent.action.kind === 'stop';
  const pending = stopping ? STOPS_IN_FLIGHT.get(state) : undefined;
  if (pending !== undefined) {
    return pending;
  }
  const work = deliver(deps, command, { device, state, intent, starter });
  if (stopping) {
    STOPS_IN_FLIGHT.set(state, work);
    const clear = (): void => {
      STOPS_IN_FLIGHT.delete(state);
    };
    work.then(clear, clear);
  }
  return work;
}

interface Delivery {
  readonly device: DeviceRow;
  readonly state: DeviceState;
  readonly intent: Plain;
  readonly starter: Starter;
}

interface InclineDelivery {
  readonly device: DeviceRow;
  readonly state: DeviceState;
  readonly starter: Starter;
}

async function confirmLight(state: DeviceState, mark: number, on: boolean): Promise<void> {
  const confirmed = await state.until(
    () =>
      state.runtime.settingsSeq > mark &&
      (((state.runtime.supplement.switches ?? 0) & LIGHT_BIT) !== 0) === on,
    INCLINE_SETTLE_MS,
  );
  if (!confirmed) {
    throw new TreadmillCommandFailedError('The light strip did not change. Check the belt.');
  }
}

async function deliverIncline(
  deps: CommandDeps,
  command: DeviceCommand,
  { device, state, starter }: InclineDelivery,
  target: number,
): Promise<string> {
  const io: InclineIo = {
    family: state.runtime.decoder.family,
    target: controlOf(device, state, deps.now()),
    write: (steps) => send(deps, device, state, steps),
  };
  const detail = await runIncline({
    command,
    state,
    starter,
    now: deps.now(),
    io,
    target,
    log: deps.log,
  });
  deps.log.info('treadmill.command_done', {
    device: device.id,
    capability: command.capability,
    remote: starter.remote,
    latencyMs: state.latencyMs,
  });
  return detail;
}

function stopIoOf(deps: CommandDeps, device: DeviceRow, state: DeviceState): StopIo {
  return {
    deviceId: device.id,
    family: state.runtime.decoder.family,
    target: controlOf(device, state, deps.now()),
    log: deps.log,
    write: (steps) => send(deps, device, state, steps),
  };
}

async function deliver(
  deps: CommandDeps,
  command: DeviceCommand,
  { device, state, intent, starter }: Delivery,
): Promise<string> {
  const settingsMark = state.runtime.settingsSeq;
  const detail = await (intent.kind === 'belt' && intent.action.kind === 'stop'
    ? stopBelt(stopIoOf(deps, device, state), state)
    : send(deps, device, state, stepsOf(deps, device, state, intent)));
  if (intent.kind === 'pad' && intent.write.key === 'light') {
    await confirmLight(state, settingsMark, intent.write.on);
  }
  const started = intent.kind === 'belt' && intent.action.kind === 'start';
  if (started && starter.remote && entrySettingsOf(state.entry).policy.stopWithoutSteps) {
    deps.guard.arm(device.id, deps.now().getTime());
  }
  deps.log.info('treadmill.command_done', {
    device: device.id,
    capability: command.capability,
    remote: starter.remote,
    latencyMs: state.latencyMs,
  });
  return detail;
}

export function treadmillDriver(deps: CommandDeps, start: DeviceDriver['start']): DeviceDriver {
  return {
    id: TREADMILL_DRIVER,
    start,
    execute: (command) => runTreadmillCommand(deps, command),
  };
}
