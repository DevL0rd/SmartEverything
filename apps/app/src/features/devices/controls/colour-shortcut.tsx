import type { ReactNode } from 'react';
import { useState } from 'react';
import { Keyboard } from 'react-native';
import { deviceFamily } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Sheet } from '../../../components/sheet';
import { useControl } from '../../../store/control';
import { useLiveControl } from '../../../store/use-live-control';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import { ColourBlock } from './colour-block';

export function ColourShortcut({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  const presented = useDeviceModel(device).presentation.capabilities.find(
    (candidate) =>
      candidate.writable &&
      (candidate.colorEncoding !== undefined || candidate.capability.value.kind === 'color'),
  );
  const raw = useControl(device.id, presented?.key ?? 'color');
  const control = useLiveControl(device, presented?.key ?? 'color', raw, true);
  if (deviceFamily(device) !== 'light' || presented === undefined) return null;
  return (
    <>
      <IconButton
        icon="palette"
        label={`${device.label} colour`}
        disabled={!device.online}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
      />
      <Sheet
        detents={['fit', 'full']}
        footer={
          <Button
            label="Done"
            onPress={() => {
              setOpen(false);
            }}
          />
        }
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={`${device.label} colour`}
      >
        <ColourBlock presented={presented} control={control} disabled={!device.online} />
      </Sheet>
    </>
  );
}
