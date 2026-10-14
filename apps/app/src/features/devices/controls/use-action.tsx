import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { useControl, type Control } from '../../../store/control';
import type { Device } from '../../../store/state';
import { useDisplayName } from '../model/display-name';
import { ActionSheet } from './action-sheet';
import { approved, presetArguments } from './run-action';

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
  control: Control,
  presented: PresentedCapability,
  name: string,
): ActionSender {
  const busy = useRef(false);
  const [sending, setSending] = useState(false);
  const send = (value: JsonValue): void => {
    if (busy.current || control.pending) {
      return;
    }
    busy.current = true;
    setSending(true);
    const submit = async (): Promise<void> => {
      try {
        if (await approved(presented, name)) {
          await control.set(value);
        }
      } finally {
        busy.current = false;
        setSending(false);
      }
    };
    void submit();
  };
  return { send, pending: sending || control.pending };
}

export function useAction(device: Device, presented: PresentedCapability): ActionHandle {
  const control = useControl(device.id, presented.key);
  const name = useDisplayName(device.id);
  const sender = useActionSender(control, presented, name);
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
        presented={presented}
        onClose={() => {
          setAsking(false);
        }}
        onRun={sender.send}
      />
    ) : null,
  };
}
