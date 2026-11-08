import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import { useRef, useState } from 'react';
import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { useControl, type Control } from '../../../store/control';
import { useEntityStore } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { displayNameOf } from '../model/display-name';
import { ActionSheet } from './action-sheet';
import { approved, presetArguments } from './run-action';

const log = new Logger('app.devices');

export interface ActionHandle {
  readonly run: () => void;
  readonly pending: boolean;
  readonly sheet: ReactNode;
}

interface ActionSender {
  readonly pending: boolean;
  readonly send: (value: JsonValue) => void;
}

function useActionSender(
  deviceId: string,
  control: Control,
  presented: PresentedCapability,
  nameOf: () => string,
): ActionSender {
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const send = (value: JsonValue): void => {
    const where = { deviceId, capability: presented.key };
    if (busy.current || control.pending) {
      log.debug('action.skipped', () => ({
        ...where,
        busy: busy.current,
        pending: control.pending,
      }));
      return;
    }
    busy.current = true;
    setSending(true);
    const startedAt = Date.now();
    const submit = async (): Promise<void> => {
      try {
        if (await approved(presented, nameOf())) {
          log.info('action.sending', { ...where, danger: presented.danger.tier });
          const sent = await control.set(value);
          log.info('action.settled', { ...where, sent, latencyMs: Date.now() - startedAt });
        } else {
          log.info('action.declined', { ...where, danger: presented.danger.tier });
        }
      } catch (error) {
        log.error('action.failed', error, { ...where, latencyMs: Date.now() - startedAt });
        throw error;
      } finally {
        busy.current = false;
        setSending(false);
      }
    };
    background(submit(), 'use_action.submit_failed');
  };
  return { send, pending: sending || control.pending };
}

export function useAction(
  device: Device,
  presented: PresentedCapability,
  opener: RefObject<View | null>,
): ActionHandle {
  const control = useControl(device.id, presented.key);
  const store = useEntityStore();
  const sender = useActionSender(device.id, control, presented, () =>
    displayNameOf(store.get(), device.id),
  );
  const [asking, setAsking] = useState(false);
  const preset = presetArguments(presented);
  return {
    run: (): void => {
      if (sender.pending || asking) {
        return;
      }
      if (preset === undefined) {
        setAsking(true);
      } else {
        sender.send(preset);
      }
    },
    pending: sender.pending,
    sheet: asking ? (
      <ActionSheet
        opener={opener}
        presented={presented}
        onClose={() => {
          setAsking(false);
        }}
        onRun={sender.send}
      />
    ) : null,
  };
}
