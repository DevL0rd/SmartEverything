import { useRef, useState } from 'react';
import { Logger, background } from '@smarteverything/logging';
import { isFinished } from '@smarteverything/domain';
import type { EntityStore } from '../../../store/entity-store';
import type { Device } from '../../../store/state';
import { useEntityStore, useLedger } from '../../../store/store-context';

const log = new Logger('app.camera-ptz');

export type PtzDirection = 'up' | 'down' | 'left' | 'right';

export interface Ptz {
  readonly supported: boolean;
  readonly moving: PtzDirection | null;
  readonly hold: (direction: PtzDirection | null) => void;
  readonly step: (direction: PtzDirection | 'home') => void;
}

function supportsPtz(device: Device, physical: boolean): boolean {
  const ptz = device.capabilities.find((capability) => capability.key === 'ptz');
  return (
    physical && ptz?.value.kind === 'action' && (ptz.value.arguments ?? []).includes('direction')
  );
}

function finished(store: EntityStore, commandId: string): Promise<void> {
  return new Promise((resolve) => {
    const done = (): boolean => {
      const row = store.get().tables.commands.byId[commandId];
      return row === undefined || isFinished(row.status);
    };
    if (done()) {
      resolve();
      return;
    }
    const stop = store.subscribe(() => {
      if (done()) {
        stop();
        resolve();
      }
    });
  });
}

async function sendLogged(
  ledger: ReturnType<typeof useLedger>,
  store: EntityStore,
  device: Device,
  direction: PtzDirection | 'home',
): Promise<boolean> {
  const startedAt = Date.now();
  const outcome = await ledger.send(device, 'ptz', { direction });
  if (!outcome.sent) {
    log.warn('ptz.refused', { deviceId: device.id, direction });
    return false;
  }
  await finished(store, outcome.row.id);
  log.debug('ptz.finished', () => ({
    deviceId: device.id,
    commandId: outcome.row.id,
    direction,
    latencyMs: Date.now() - startedAt,
  }));
  return true;
}

export function usePtz(device: Device, physical: boolean): Ptz {
  const ledger = useLedger();
  const store = useEntityStore();
  const [moving, setMoving] = useState<PtzDirection | null>(null);
  const held = useRef<PtzDirection | null>(null);
  const running = useRef(false);
  const supported = supportsPtz(device, physical);
  const send = (direction: PtzDirection | 'home'): Promise<boolean> =>
    sendLogged(ledger, store, device, direction);
  const keepMoving = async (): Promise<void> => {
    running.current = true;
    let direction = held.current;
    while (direction !== null && (await send(direction))) {
      direction = held.current;
    }
    running.current = false;
    held.current = null;
    setMoving(null);
  };
  return {
    supported,
    moving,
    hold: (direction): void => {
      held.current = supported ? direction : null;
      setMoving(held.current);
      if (held.current !== null && !running.current) {
        background(keepMoving(), 'moving.keep_failed');
      }
    },
    step: (direction): void => {
      if (!supported || running.current) {
        return;
      }
      running.current = true;
      background(
        send(direction).finally(() => {
          running.current = false;
        }),
        'use_ptz.send_failed',
      );
    },
  };
}
