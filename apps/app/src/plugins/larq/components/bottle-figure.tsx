import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  DeviceVisual,
  useDeviceVisualState,
  useVisualPx,
  type VisualPx,
  type VisualSize,
} from '../../../features/device-visuals';
import { Interactive } from '../../../components/interactive';
import type { Device } from '../../../store/state';

const CAP_SPOT = { left: '38%', top: '0%', width: '24%', height: '24%' } as const;
const TRIMMED_CAP_SPOT = { left: '29%', top: '0%', width: '42%', height: '24%' } as const;
const TRIM = 0.56;

interface FigureProps {
  readonly device: Device;
  readonly view: BottleStatusView | undefined;
  readonly size?: VisualSize;
  readonly px?: VisualPx;
  readonly trim?: boolean;
  readonly onCapPress?: () => void;
}

function useFigureState(
  device: Device,
  view: BottleStatusView | undefined,
): ReturnType<typeof useDeviceVisualState> {
  const base = useDeviceVisualState(device);
  const facts = base.bottle;
  if (facts === undefined || view === undefined) {
    return base;
  }
  const tilt = view.orientation?.orientation;
  return {
    ...base,
    bottle: { ...facts, filter: view.filter !== null, ...(tilt === undefined ? {} : { tilt }) },
  };
}

function Trimmed({
  px,
  children,
}: {
  readonly px: number;
  readonly children: ReactNode;
}): ReactNode {
  const frame = { width: px * TRIM, alignItems: 'center' as const };
  const pulled = { marginHorizontal: (-px * (1 - TRIM)) / 2 };
  return (
    <View style={frame}>
      <View style={pulled}>{children}</View>
    </View>
  );
}

function CapSpot({
  trim,
  onPress,
}: {
  readonly trim: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View style={trim ? TRIMMED_CAP_SPOT : CAP_SPOT} className="absolute">
      <Interactive
        role="button"
        label="What the light on the cap means"
        onPress={onPress}
        className="size-full"
      >
        <View className="size-full" />
      </Interactive>
    </View>
  );
}

export function BottleFigure({
  device,
  view,
  size = 'hero',
  px,
  trim = false,
  onCapPress,
}: FigureProps): ReactNode {
  const state = useFigureState(device, view);
  const sized = useVisualPx(size);
  const drawn = (
    <DeviceVisual device={device} size={size} state={state} {...(px === undefined ? {} : { px })} />
  );
  const visual = trim ? <Trimmed px={px ?? sized}>{drawn}</Trimmed> : drawn;
  if (onCapPress === undefined) {
    return visual;
  }
  return (
    <View className="relative">
      {visual}
      <CapSpot trim={trim} onPress={onCapPress} />
    </View>
  );
}
