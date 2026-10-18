import type { ReactNode } from 'react';
import { Button } from '../../../components/button';
import type { Device } from '../../../store/state';
import { usePowerAction } from '../controls/power-toggle';

export function TurnOnButton({ device }: { readonly device: Device }): ReactNode {
  const power = usePowerAction(device);
  return (
    <Button
      label="Turn on"
      icon="power"
      variant="filled"
      disabled={!device.online}
      onPress={() => {
        power.set(true);
      }}
    />
  );
}
