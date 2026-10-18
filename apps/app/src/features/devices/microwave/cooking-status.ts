import {
  MICROWAVE_KEYS,
  type JsonValue,
  microwaveProgramError,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import {
  microwaveReason,
  programPowerOptions,
  reportedProgram,
  type MicrowaveConfiguration,
} from './model';

export interface CookingStatus {
  readonly mode: MicrowaveMode | undefined;
  readonly program: MicrowaveProgram | null;
  readonly readiness: string | null;
  readonly notice: string | null;
  readonly error: string | null;
  readonly runnable: boolean;
  readonly savable: boolean;
  readonly selectable: boolean;
  readonly editable: boolean;
  readonly startsRemotely: boolean;
}
interface StatusInput {
  readonly device: Device;
  readonly values: DeviceValues;
  readonly config: MicrowaveConfiguration;
  readonly draft: MicrowaveProgram | null;
  readonly seed: MicrowaveProgram | null;
  readonly busy: boolean;
}

function programError(
  program: MicrowaveProgram | null,
  mode: MicrowaveMode | undefined,
  config: MicrowaveConfiguration,
): string | null {
  return program === null || mode === undefined
    ? null
    : microwaveProgramError(program, mode, programPowerOptions(mode, config), config.unit);
}
function noticeOf(
  readiness: string | null,
  program: MicrowaveProgram | null,
  config: MicrowaveConfiguration,
): string | null {
  if (readiness !== null || program !== null) {
    return readiness;
  }
  return config.problem ?? 'Choose a cooking mode to prepare a program.';
}
function abilities(
  mode: MicrowaveMode | undefined,
  state: JsonValue | undefined,
  busy: boolean,
): Pick<CookingStatus, 'selectable' | 'editable' | 'startsRemotely'> & {
  readonly canSet: boolean;
} {
  const selectable = !busy && state !== 'running' && state !== 'paused';
  const canSet = mode?.supportedOperations.includes('set') === true;
  return {
    selectable,
    canSet,
    editable: selectable && canSet,
    startsRemotely: mode?.supportedOperations.includes('start') === true,
  };
}
function startingProgram(
  draft: MicrowaveProgram | null,
  seed: MicrowaveProgram | null,
  state: JsonValue | undefined,
): MicrowaveProgram | null {
  const cooking = state === 'running' || state === 'paused';
  return draft ?? (cooking ? null : seed);
}

export function cookingStatus({
  device,
  values,
  config,
  draft,
  seed,
  busy,
}: StatusInput): CookingStatus {
  const state = values[MICROWAVE_KEYS.state]?.value;
  const chosen = startingProgram(draft, seed, state);
  const mode = config.modes.find((entry) => entry.mode === (chosen?.mode ?? config.applied));
  const program = mode === undefined ? null : (chosen ?? reportedProgram(mode, config, values));
  const readiness = microwaveReason(device, values);
  const error = programError(program, mode, config);
  const { canSet, ...can } = abilities(mode, state, busy);
  const runnable = readiness === null && error === null && program !== null && !busy;
  return {
    ...can,
    mode,
    program,
    readiness,
    notice: noticeOf(readiness, program, config),
    error,
    runnable,
    savable: runnable && (canSet || program.mode !== config.applied),
  };
}
