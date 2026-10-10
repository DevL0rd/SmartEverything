import type { ReactNode } from 'react';
import { useState } from 'react';
import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { useDisplayName } from '../model/display-name';
import { ActionSheet } from './action-sheet';
import { approved, presetArguments } from './run-action';

export interface ActionHandle {
  readonly run: () => void;
  readonly pending: boolean;
  readonly sheet: ReactNode;
}

export function useAction(device: Device, presented: PresentedCapability): ActionHandle {
  const control = useControl(device.id, presented.key);
  const name = useDisplayName(device.id);
  const [asking, setAsking] = useState(false);
  const send = (value: JsonValue): void => {
    void approved(presented, name).then((yes) => {
      if (yes) {
        void control.set(value);
      }
    });
  };
  const preset = presetArguments(presented);
  return {
    run: (): void => {
      if (preset === undefined) {
        setAsking(true);
      } else {
        send(preset);
      }
    },
    pending: control.pending,
    sheet: asking ? (
      <ActionSheet
        presented={presented}
        onClose={() => {
          setAsking(false);
        }}
        onRun={send}
      />
    ) : null,
  };
}
