import {
  MICROWAVE_KEYS,
  type JsonValue,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import type { DeviceValues, StoreState } from '../../../store/state';
import { slotOf } from '../../../store/command-ledger';

export function confirmedValue(values: DeviceValues, key: string, value: JsonValue): boolean {
  const reported = values[key];
  return reported !== undefined && reported.optimistic !== true && reported.value === value;
}
export function programConfirmed(
  program: MicrowaveProgram,
  mode: MicrowaveMode,
  unit: string,
  values: DeviceValues,
): boolean {
  const options = mode.supportedOptions;
  const expected = [
    { key: MICROWAVE_KEYS.mode, value: program.mode },
    ...(options.operationTime === undefined
      ? []
      : [{ key: MICROWAVE_KEYS.duration, value: program.duration }]),
    ...(options.powerLevel === undefined
      ? []
      : [{ key: MICROWAVE_KEYS.power, value: program.power }]),
    ...(options.temperature?.[unit] === undefined
      ? []
      : [{ key: MICROWAVE_KEYS.temperature, value: program.temperature }]),
  ];
  return expected.every(({ key, value }) => confirmedValue(values, key, value));
}
export function programPending(state: StoreState, deviceId: string): boolean {
  return [
    MICROWAVE_KEYS.mode,
    MICROWAVE_KEYS.setDuration,
    MICROWAVE_KEYS.power,
    MICROWAVE_KEYS.temperature,
  ].some((key) => {
    const entry = state.ledger[slotOf(deviceId, key)];
    return entry?.failure === null;
  });
}
interface StartStatus {
  readonly program: MicrowaveProgram | null;
  readonly mode: MicrowaveMode | undefined;
  readonly unit: string;
  readonly values: DeviceValues;
  readonly error: string | null;
  readonly unconfirmed: boolean;
  readonly configurationProblem: string | null;
}
export function programStartReason({
  program,
  mode,
  unit,
  values,
  error,
  unconfirmed,
  configurationProblem,
}: StartStatus): string | null {
  if (program === null || mode === undefined) {
    return configurationProblem ?? 'Choose a cooking mode to prepare a program.';
  }
  if (error !== null) {
    return error;
  }
  if (unconfirmed || !programConfirmed(program, mode, unit, values)) {
    return 'Save the program and wait for the microwave to confirm its settings before starting.';
  }
  return null;
}
