import { useRef, type ReactNode } from 'react';
import type { View } from 'react-native';
import type { PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import type { Device } from '../../../store/state';
import { actionLookOf } from './run-action';
import { useAction } from './use-action';

export function ActionButton({
  device,
  presented,
  disabled,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly disabled: boolean;
}): ReactNode {
  const opener = useRef<View>(null);
  const action = useAction(device, presented, opener);
  return (
    <>
      <Button
        label={presented.label}
        variant={actionLookOf(presented).destructive ? 'destructive' : 'tonal'}
        loading={action.pending}
        disabled={disabled}
        ref={opener}
        onPress={action.run}
      />
      {action.sheet}
    </>
  );
}
