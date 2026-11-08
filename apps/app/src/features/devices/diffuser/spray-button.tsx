import { useRef, type ReactNode } from 'react';
import type { View } from 'react-native';
import { withRole, type PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import type { Device } from '../../../store/state';
import { useAction } from '../controls/use-action';
import { useDeviceModel } from '../model/device-model';

function SprayNow({
  device,
  spray,
}: {
  readonly device: Device;
  readonly spray: PresentedCapability;
}): ReactNode {
  const opener = useRef<View>(null);
  const action = useAction(device, spray, opener);
  return (
    <>
      <Button
        label={spray.label}
        icon="droplet"
        variant="tonal"
        loading={action.pending}
        disabled={!device.online}
        ref={opener}
        onPress={action.run}
      />
      {action.sheet}
    </>
  );
}

export function SprayButton({ device }: { readonly device: Device }): ReactNode {
  const spray = withRole(useDeviceModel(device).presentation, 'spray');
  return spray === undefined ? null : <SprayNow device={device} spray={spray} />;
}
