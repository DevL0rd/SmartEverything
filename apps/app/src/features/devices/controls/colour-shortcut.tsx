import type { ReactNode } from 'react';
import { useState } from 'react';
import { Keyboard, View, type ViewStyle } from 'react-native';
import { Tap } from '../../../components/tap';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { useDeviceColour } from '../../device-visuals';
import { deviceModelOf } from '../model/device-model';
import { colourAccessOf, lightPartsOf } from '../model/light-state';
import { LightColourSheet } from './light-colour-sheet';

export function ColourDot({
  device,
  colour,
  onPress,
}: {
  readonly device: Device;
  readonly colour: string | null;
  readonly onPress: () => void;
}): ReactNode {
  const fill: ViewStyle | undefined = colour === null ? undefined : { backgroundColor: colour };
  return (
    <Tap
      role="button"
      label={`${device.label} colour`}
      disabled={!device.online}
      onPress={onPress}
      className="size-touch-min items-center justify-center rounded-full"
    >
      <View
        className={cn(
          'size-6 rounded-full border-hairline border-track',
          colour === null && 'bg-surface-3',
        )}
        style={fill}
        pointerEvents="none"
      />
    </Tap>
  );
}

export function ColourSheetDot({
  device,
  colour,
}: {
  readonly device: Device;
  readonly colour: string | null;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (colourAccessOf(lightPartsOf(deviceModelOf(device))) === null) {
    return null;
  }
  return (
    <>
      <ColourDot
        device={device}
        colour={colour}
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
      />
      <LightColourSheet
        device={device}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

export function ColourShortcut({ device }: { readonly device: Device }): ReactNode {
  return <ColourSheetDot device={device} colour={useDeviceColour(device)} />;
}
