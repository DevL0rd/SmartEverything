import { deviceFamily, type DeviceFamily } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import type { Device } from '../../store/state';
import {
  useDeviceVisualState,
  useScaleVisualState,
  useWatchVisualState,
} from './model/use-visual-state';
import { useAnimationGate } from '../../design/animation-gate';
import { useOnScreen } from '../../design/visibility';
import { VISUALS } from './registry';
import type { VisualSize, VisualState, VisualTone } from './types';
import { SIZE_CLASS, useVisualPx, type VisualPx } from './visual-size';
import { CameraMedia } from './visuals/camera-media';

function toneOf(state: VisualState): VisualTone {
  if (!state.online) {
    return 'offline';
  }
  return state.power === 'off' ? 'idle' : 'active';
}

interface VisualViewProps {
  readonly family: DeviceFamily;
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly px?: VisualPx;
}

function VisualView({ family, state, size, px: fixed }: VisualViewProps): ReactNode {
  const frame = useRef<View>(null);
  const natural = useVisualPx(size);
  const px = fixed ?? natural;
  const tone = toneOf(state);
  const { visible, onLayout } = useOnScreen(frame);
  const animated = tone === 'active' || (state.online && state.ambientLight === true);
  const { moving, reduced } = useAnimationGate(animated, visible);
  const Visual = VISUALS[family];
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      aria-hidden
      pointerEvents="none"
      className={cn('relative shrink-0', SIZE_CLASS[px], tone === 'offline' && 'opacity-60')}
    >
      <Visual state={state} size={size} px={px} tone={tone} moving={moving} reduced={reduced} />
    </View>
  );
}

interface HostProps {
  readonly device: Device;
  readonly size: VisualSize;
}

function PlainVisual({ device, size }: HostProps): ReactNode {
  return (
    <VisualView family={deviceFamily(device)} state={useDeviceVisualState(device)} size={size} />
  );
}

function ScaleVisual({ device, size }: HostProps): ReactNode {
  return <VisualView family="scale" state={useScaleVisualState(device)} size={size} />;
}

function WatchVisual({ device, size }: HostProps): ReactNode {
  return <VisualView family="wearable" state={useWatchVisualState(device)} size={size} />;
}

const HOSTS: Partial<Readonly<Record<DeviceFamily, (props: HostProps) => ReactNode>>> = {
  scale: ScaleVisual,
  wearable: WatchVisual,
  camera: CameraMedia,
};

export interface DeviceVisualProps {
  readonly device: Device;
  readonly size: VisualSize;
  readonly state?: VisualState;
  readonly px?: VisualPx;
}

export function DeviceVisual({ device, size, state, px }: DeviceVisualProps): ReactNode {
  const family = deviceFamily(device);
  if (state !== undefined) {
    return (
      <VisualView family={family} state={state} size={size} {...(px === undefined ? {} : { px })} />
    );
  }
  const Host = HOSTS[family] ?? PlainVisual;
  return <Host device={device} size={size} />;
}
