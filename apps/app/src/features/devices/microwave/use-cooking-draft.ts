import { useRef, useState } from 'react';
import {
  MICROWAVE_KEYS,
  microwavePowerOptions,
  microwaveProgramError,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import { useControl } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import { useEntityStore, useLedger, useStoreSelector } from '../../../store/store-context';
import type { Device, DeviceValues } from '../../../store/state';
import {
  initialProgram,
  reportedProgram,
  microwaveConfiguration,
  microwaveReason,
  type MicrowaveConfiguration,
} from './model';
import { programPending, programStartReason } from './program-status';
import { programChanges, sendProgram } from './send-program';

export interface CookingDraft {
  readonly config: MicrowaveConfiguration;
  readonly mode: MicrowaveMode | undefined;
  readonly program: MicrowaveProgram | null;
  readonly values: DeviceValues;
  readonly observedMode: MicrowaveMode | undefined;
  readonly changedMode: boolean;
  readonly busy: boolean;
  readonly result: string | null;
  readonly error: string | null;
  readonly reason: string | null;
  readonly startReason: string | null;
  readonly disabled: boolean;
  readonly change: (program: MicrowaveProgram) => void;
  readonly select: (mode: string) => void;
  readonly save: () => Promise<void>;
}
function resultText(success: boolean, changed: boolean): string {
  if (!success) {
    return 'The program was not fully saved. Check the reported settings before trying again.';
  }
  return changed
    ? 'Cooking mode requested. Wait for it to update, then save program settings.'
    : 'Program settings sent. Wait for the reported settings to match before starting.';
}
function useProgramSender(device: Device): {
  readonly busy: boolean;
  readonly result: string | null;
  readonly clear: () => void;
  readonly failed: boolean;
  readonly save: (
    program: MicrowaveProgram,
    mode: MicrowaveMode,
    unit: string,
    changed: boolean,
  ) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const sending = useRef(false);
  const [failed, setFailed] = useState(false);
  const control = useControl(device.id, MICROWAVE_KEYS.mode);
  const ledger = useLedger();
  const store = useEntityStore();
  return {
    busy: busy || control.pending,
    result,
    failed,
    clear: (): void => {
      setResult(null);
    },
    save: async (program, mode, unit, changed): Promise<void> => {
      if (sending.current || control.pending) {
        return;
      }
      sending.current = true;
      setBusy(true);
      setResult(null);
      try {
        const changes = changed
          ? [{ capability: MICROWAVE_KEYS.mode, value: program.mode }]
          : programChanges(program, mode, unit);
        const success = await sendProgram(device, ledger, store, changes);
        setFailed(!success);
        setResult(resultText(success, changed));
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
  };
}
function programOf(
  mode: MicrowaveMode | undefined,
  draft: MicrowaveProgram | null,
  config: MicrowaveConfiguration,
  values: DeviceValues,
): MicrowaveProgram | null {
  return mode === undefined ? null : (draft ?? reportedProgram(mode, config, values));
}
export function useCookingDraft(device: Device): CookingDraft {
  const values = useDeviceValues(device.id);
  const config = microwaveConfiguration(device, values);
  const [draft, setDraft] = useState<MicrowaveProgram | null>(null);
  const sender = useProgramSender(device);
  const pending = useStoreSelector((state) => programPending(state, device.id), Object.is, [
    device.id,
  ]);
  const observed = values[MICROWAVE_KEYS.mode]?.value;
  const mode = config.modes.find((entry) => entry.mode === (draft?.mode ?? observed));
  const program = programOf(mode, draft, config, values);
  const reason = microwaveReason(device, values);
  const status = cookingStatus(
    { program, mode, config, values },
    reason,
    sender.busy || pending,
    sender.failed,
  );
  return {
    config,
    mode,
    program,
    values,
    observedMode: config.modes.find((entry) => entry.mode === observed),
    ...status,
    busy: sender.busy,
    result: sender.result,
    change: (next): void => {
      setDraft(next);
      sender.clear();
    },
    select: (name): void => {
      chooseMode(config, name, setDraft);
      sender.clear();
    },
    save: async (): Promise<void> => {
      if (mode !== undefined && program !== null && !status.disabled) {
        await sender.save(program, mode, config.unit, status.changedMode);
      }
    },
  };
}

function chooseMode(
  config: MicrowaveConfiguration,
  name: string,
  change: (program: MicrowaveProgram) => void,
): void {
  const chosen = config.modes.find((entry) => entry.mode === name);
  if (chosen !== undefined) {
    change(initialProgram(chosen, config));
  }
}

interface ProgramContext {
  readonly program: MicrowaveProgram | null;
  readonly mode: MicrowaveMode | undefined;
  readonly config: MicrowaveConfiguration;
  readonly values: DeviceValues;
}
function cookingStatus(
  { program, mode, config, values }: ProgramContext,
  reason: string | null,
  pending: boolean,
  failed: boolean,
): Pick<CookingDraft, 'changedMode' | 'error' | 'reason' | 'startReason' | 'disabled'> {
  const error =
    mode === undefined || program === null
      ? null
      : microwaveProgramError(
          program,
          mode,
          microwavePowerOptions(mode, config.supportedPower),
          config.unit,
        );
  const changedMode = changedProgramMode(program, values);
  const cannotSet = cannotSaveMode(mode, changedMode);
  const modeUnconfirmed = values[MICROWAVE_KEYS.mode]?.optimistic === true;
  return {
    error,
    reason,
    changedMode,
    disabled: reason !== null || error !== null || cannotSet || pending || modeUnconfirmed,
    startReason:
      programStartReason({
        program,
        mode,
        unit: config.unit,
        values,
        error,
        unconfirmed: pending || failed,
        configurationProblem: config.problem,
      }) ?? reason,
  };
}

function changedProgramMode(program: MicrowaveProgram | null, values: DeviceValues): boolean {
  return program !== null && program.mode !== values[MICROWAVE_KEYS.mode]?.value;
}
function cannotSaveMode(mode: MicrowaveMode | undefined, changed: boolean): boolean {
  return mode === undefined || (!changed && !mode.supportedOperations.includes('set'));
}
