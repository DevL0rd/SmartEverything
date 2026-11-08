import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Keyboard, View } from 'react-native';
import { withRole, type CapabilityRole } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Sheet } from '../../../components/sheet';
import { SplitRing } from '../../../components/split-ring';
import { useInActionBand } from '../../../components/widget-board/band-context';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useThemeSetting } from '../../../design/theme';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import type { Device } from '../../../store/state';
import { useDeviceColour } from '../../device-visuals';
import { ControlBlock } from '../controls/control-block';
import { useDeviceModel } from '../model/device-model';

const RING_INSET = 8;
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

function Swatch({
  device,
  lit,
  label,
  box,
}: {
  readonly device: Device;
  readonly lit: boolean;
  readonly label: string;
  readonly box: number;
}): ReactNode {
  const colour = useDeviceColour(device);
  const outer = box - RING_INSET;
  const ring = { width: outer, height: outer };
  return (
    <>
      <View
        className="absolute rounded-full border-hairline border-track"
        style={ring}
        pointerEvents="none"
      />
      <View className="absolute" pointerEvents="none">
        <SplitRing
          colours={colour === null || !lit || !device.online ? [] : [colour]}
          size={outer - RING_EDGE}
          label={label}
        />
      </View>
    </>
  );
}

function LightSheet({
  device,
  label,
  opener,
  open,
  onOpen,
}: {
  readonly device: Device;
  readonly label: string;
  readonly opener: RefObject<View | null>;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
}): ReactNode {
  const close = (): void => {
    onOpen(false);
  };
  return (
    <Sheet
      subpage={{ opener }}
      detents={['fit', 'full']}
      footer={<Button label="Done" onPress={close} />}
      open={open}
      onClose={close}
      title={label}
    >
      <LightControls device={device} />
    </Sheet>
  );
}

export function LightSheetButton({
  device,
  lit,
}: {
  readonly device: Device;
  readonly lit: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const label = `${device.label} light`;
  const banded = useInActionBand();
  const sizes = SEMANTIC_SIZES[useIdiom()][useThemeSetting('density')];
  return (
    <>
      <View
        className={cn('items-center justify-center', banded ? 'size-control-h' : 'size-touch-min')}
      >
        <Swatch
          device={device}
          lit={lit}
          label={label}
          box={banded ? sizes.controlH : sizes.touchMin}
        />
        <IconButton
          ref={opener}
          icon="palette"
          label={label}
          disabled={!device.online}
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
        />
      </View>
      <LightSheet device={device} label={label} opener={opener} open={open} onOpen={setOpen} />
    </>
  );
}
