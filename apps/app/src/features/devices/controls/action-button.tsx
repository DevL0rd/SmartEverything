import type { ReactNode } from 'react';
import type { PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import type { Device } from '../../../store/state';
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
  const action = useAction(device, presented);
  return (
    <>
      <Button
        label={presented.label}
        variant={presented.danger.tier === 'none' ? 'tonal' : 'destructive'}
        loading={action.pending}
        disabled={disabled}
        onPress={action.run}
      />
      {action.sheet}
    </>
  );
}
