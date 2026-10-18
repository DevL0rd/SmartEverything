import { useRef, useState } from 'react';
import type { LaundryDraft } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { useEntityStore, useLedger } from '../../../store/store-context';
import { stepsOf } from './draft';
import { failureText, sendPlan } from './send-plan';
import type { Laundry } from './use-laundry';

const log = new Logger('app.devices');

export interface Starter {
  readonly starting: boolean;
  readonly failure: string | null;
  readonly send: (draft: LaundryDraft, done?: () => void) => void;
  readonly clear: () => void;
}

export function useStarter(laundry: Laundry): Starter {
  const ledger = useLedger();
  const store = useEntityStore();
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const busy = useRef(false);
  const { device } = laundry;
  return {
    starting,
    failure,
    clear: (): void => {
      setFailure(null);
    },
    send: (draft, done): void => {
      if (busy.current) {
        return;
      }
      busy.current = true;
      setStarting(true);
      setFailure(null);
      background(
        sendPlan({ device, ledger, store }, stepsOf(laundry, draft))
          .then((result) => {
            log.info('laundry.start_finished', { deviceId: device.id, sent: result.sent });
            setFailure(result.sent ? null : failureText(result));
            if (result.sent) {
              done?.();
            }
          })
          .finally(() => {
            busy.current = false;
            setStarting(false);
          }),
        'laundry.start_failed',
      );
    },
  };
}
