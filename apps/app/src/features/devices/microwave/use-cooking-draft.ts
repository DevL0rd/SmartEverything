import { useState } from 'react';
import { Logger } from '@smarteverything/logging';
import type { MicrowaveProgram } from '@smarteverything/domain';
import { useDeviceValues } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import type { Device, DeviceValues } from '../../../store/state';
import { cookingStatus, type CookingStatus } from './cooking-status';
import { initialProgram, microwaveConfiguration, type MicrowaveConfiguration } from './model';
import { programPending } from './program-status';
import { useQuickState } from './use-quick';
import { useProgramSender } from './use-program-sender';

export interface CookingDraft extends CookingStatus {
  readonly config: MicrowaveConfiguration;
  readonly values: DeviceValues;
  readonly result: string | null;
  readonly busy: boolean;
  readonly change: (program: MicrowaveProgram) => void;
  readonly select: (mode: string) => void;
  readonly run: (start: boolean) => Promise<void>;
}

const log = new Logger('app.devices');

function chosenProgram(config: MicrowaveConfiguration, name: string): MicrowaveProgram | undefined {
  const chosen = config.modes.find((entry) => entry.mode === name);
  return chosen === undefined ? undefined : initialProgram(chosen, config);
}
export function useCookingDraft(device: Device): CookingDraft {
  const values = useDeviceValues(device.id);
  const config = microwaveConfiguration(device, values);
  const [draft, setDraft] = useState<MicrowaveProgram | null>(null);
  const sender = useProgramSender(device);
  const pending = useStoreSelector((state) => programPending(state, device.id), Object.is, [
    device.id,
  ]);
  const busy = sender.sending || pending;
  const quick = useQuickState(device, true);
  const seed = quick.kind === 'ready' ? quick.primary.program : null;
  const status = cookingStatus({ device, values, config, draft, seed, busy });
  return {
    ...status,
    config,
    values,
    result: sender.result,
    busy,
    change: (next): void => {
      log.trace('microwave.draft_changed', { deviceId: device.id, mode: next.mode });
      setDraft(next);
      sender.clear();
    },
    select: (name): void => {
      log.debug('microwave.mode_selected', { deviceId: device.id, mode: name });
      setDraft(chosenProgram(config, name) ?? draft);
      sender.clear();
    },
    run: async (start): Promise<void> => {
      const { mode, program } = status;
      if (mode !== undefined && program !== null) {
        await sender.send({ program, mode, unit: config.unit, applied: config.applied, start });
      }
    },
  };
}
