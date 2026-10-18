import { useState, type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
import { withRole, type CapabilityRole } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Sheet } from '../../../components/sheet';
import { SplitRing } from '../../../components/split-ring';
import type { Device } from '../../../store/state';
import { useDeviceColour } from '../../device-visuals';
import { ControlBlock } from '../controls/control-block';
import { useDeviceModel } from '../model/device-model';
import { useDiffuserRead } from './use-diffuser';

const RING_SIZE = 38;
const RING_EDGE = 2;
const LIGHT_ROLES: readonly CapabilityRole[] = ['ambient_light', 'color', 'brightness'];

function LightControls({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  return (
    <View className="gap-5">
      {LIGHT_ROLES.map((role) => {
        const presented = withRole(model.presentation, role);
        return presented === undefined ? null : (
          <ControlBlock key={role} device={device} presented={presented} reason={null} />
        );
      })}
    </View>
  );
}

function Swatch({ device, label }: { readonly device: Device; readonly label: string }): ReactNode {
  const colour = useDeviceColour(device);
  const { light } = useDiffuserRead(device);
  const ring = { width: RING_SIZE + RING_EDGE, height: RING_SIZE + RING_EDGE };
  return (
    <>
      <View
        className="absolute rounded-full border-hairline border-track"
        style={ring}
        pointerEvents="none"
      />
      <View className="absolute" pointerEvents="none">
        <SplitRing
          colours={colour === null || light !== true || !device.online ? [] : [colour]}
          size={RING_SIZE}
          label={label}
        />
      </View>
    </>
  );
}

export function LightSheetButton({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  const label = `${device.label} light`;
  return (
    <>
      <View className="size-touch-min items-center justify-center">
        <Swatch device={device} label={label} />
        <IconButton
          icon="palette"
          label={label}
          disabled={!device.online}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
        />
      </View>
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
        title={label}
      >
        <LightControls device={device} />
      </Sheet>
    </>
  );
}
