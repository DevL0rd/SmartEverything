import { useRef, useState } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { useLedger } from '../../../store/store-context';
import { ACTION_ROLE, type LaundryActionId } from './actions';
import type { Laundry } from './use-laundry';

const log = new Logger('app.devices');

export interface Runner {
  readonly pending: LaundryActionId | null;
  readonly run: (id: LaundryActionId) => void;
}

const VALUES: Readonly<Partial<Record<LaundryActionId, JsonValue>>> = {
  pause: null,
  resume: null,
  startNow: null,
  garment: null,
  unlock: null,
  stopTumbling: null,
  stop: null,
  cancelDelay: 'None',
};

function askToStop(): Promise<boolean> {
  return confirm({
    title: 'Stop the wash?',
    body: 'The machine drains and unlocks the door when it is safe.',
    confirmLabel: 'Stop wash',
    tone: 'destructive',
  });
}

export function useRunner(laundry: Laundry, onAdvice: () => void): Runner {
  const ledger = useLedger();
  const [pending, setPending] = useState<LaundryActionId | null>(null);
  const busy = useRef(false);
  const { device, keyOf } = laundry;
  const send = async (id: LaundryActionId): Promise<void> => {
    const role = ACTION_ROLE[id];
    const key = role === null ? undefined : keyOf(role);
    const value = VALUES[id];
    if (key === undefined || value === undefined) {
      return;
    }
    if (id === 'stop' && !(await askToStop())) {
      return;
    }
    const sent = await ledger.send(device, key, value);
    log.info('laundry.action', { deviceId: device.id, action: id, sent: sent.sent });
  };
  return {
    pending,
    run: (id): void => {
      if (id === 'advice') {
        onAdvice();
        return;
      }
      if (busy.current) {
        return;
      }
      busy.current = true;
      setPending(id);
      background(
        send(id).finally(() => {
          busy.current = false;
          setPending(null);
        }),
        'laundry.action_failed',
      );
    },
  };
}
