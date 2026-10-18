import { useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { microwaveStartable } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { useLedger, useEntityStore } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { programPlan, runProgram, type PlanInput } from './send-program';

const log = new Logger('app.devices');

function resultText(success: boolean, input: PlanInput): string | null {
  const { start, mode } = input;
  if (success) {
    if (start) {
      return null;
    }
    return microwaveStartable(mode) ? 'Program saved.' : 'Set. Press Start on the microwave.';
  }
  return start
    ? 'Cooking did not start. Check the reported settings before trying again.'
    : 'The program was not fully saved. Check the reported settings before trying again.';
}
export interface ProgramSender {
  readonly sending: boolean;
  readonly result: string | null;
  readonly clear: () => void;
  readonly send: (input: PlanInput) => Promise<void>;
}

export function useProgramSender(device: Device, announce = false): ProgramSender {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const active = useRef(false);
  const ledger = useLedger();
  const store = useEntityStore();
  return {
    sending,
    result,
    clear: (): void => {
      setResult(null);
    },
    send: async (input): Promise<void> => {
      if (active.current) {
        log.debug('microwave.send_skipped', { deviceId: device.id, reason: 'already_sending' });
        return;
      }
      active.current = true;
      const startedAt = Date.now();
      setSending(true);
      setResult(null);
      try {
        const success = await runProgram({ device, ledger, store }, programPlan(input));
        const message = resultText(success, input);
        setResult(message);
        if (announce && message !== null) {
          notify({ message, tone: success ? 'positive' : 'critical' });
        }
        log.info('microwave.program_finished', {
          deviceId: device.id,
          success,
          start: input.start,
          mode: input.program.mode,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        log.error('microwave.program_failed', error, {
          deviceId: device.id,
          start: input.start,
          latencyMs: Date.now() - startedAt,
        });
        throw error;
      } finally {
        active.current = false;
        setSending(false);
      }
    },
  };
}
