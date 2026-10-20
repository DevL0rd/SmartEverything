import { deviceFamily, type DeviceFamily } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { cn } from '../../design/cn';
import { LogTally } from '../../design/log-tally';
import type { Device } from '../../store/state';
import { useButtonVisualState, useHubVisualState } from './model/use-button-facts';
import {
  useDeviceVisualState,
  useScaleVisualState,
  useWatchVisualState,
} from './model/use-visual-state';
import { useOnScreenGate } from '../../design/visibility';
import { usePrinterFacts } from './model/use-printer-live';
import { VISUALS } from './registry';
import type { VisualSize, VisualState, VisualTone } from './types';
import { FIXED_PX, SIZE_CLASS, useVisualPx, type VisualPx } from './visual-size';
import { CameraMedia } from './visuals/camera-media';

const log = new Logger('app.device-visuals');

let mountedVisuals = 0;

const tally = new LogTally(log, 'visual.summarised', 10_000, () => ({ mountedVisuals }));

function useVisualTally(family: DeviceFamily): void {
  useEffect(() => {
    mountedVisuals += 1;
    tally.bump(`mounted_${family}`);
    return (): void => {
      mountedVisuals -= 1;
      tally.bump(`unmounted_${family}`);
    };
  }, [family]);
}

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

function HeroVisualView(props: VisualViewProps): ReactNode {
  return <SizedVisualView {...props} px={useVisualPx('hero')} />;
}

function VisualView(props: VisualViewProps): ReactNode {
  const { size, px } = props;
  if (px !== undefined) return <SizedVisualView {...props} px={px} />;
  return size === 'hero' ? (
    <HeroVisualView {...props} />
  ) : (
    <SizedVisualView {...props} px={FIXED_PX[size]} />
  );
}

function SizedVisualView({
  family,
  state,
  size,
  px,
}: VisualViewProps & { readonly px: VisualPx }): ReactNode {
  const frame = useRef<View>(null);
  const tone = toneOf(state);
  const animated = tone === 'active' || (state.online && state.ambientLight === true);
  const { moving, reduced, onLayout } = useOnScreenGate(frame, animated);
  useVisualTally(family);
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

function ButtonHost({ device, size }: HostProps): ReactNode {
  return <VisualView family="button" state={useButtonVisualState(device)} size={size} />;
}

function PrinterHost({ device, size }: HostProps): ReactNode {
  const base = useDeviceVisualState(device);
  const printer = usePrinterFacts(device);
  const state: VisualState =
    printer === null ? base : { ...base, online: device.online, power: 'on', printer };
  return <VisualView family="printer" state={state} size={size} />;
}

function HubHost({ device, size }: HostProps): ReactNode {
  return <VisualView family="gateway" state={useHubVisualState(device)} size={size} />;
}

const HOSTS: Partial<Readonly<Record<DeviceFamily, (props: HostProps) => ReactNode>>> = {
  scale: ScaleVisual,
  wearable: WatchVisual,
  button: ButtonHost,
  gateway: HubHost,
  printer: PrinterHost,
  camera: CameraMedia,
};

export function ownsVisualState(device: Device): boolean {
  return HOSTS[deviceFamily(device)] !== undefined;
}

export function FamilyVisual({
  family,
  state,
  size,
  px,
}: {
  readonly family: DeviceFamily;
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly px?: VisualPx;
}): ReactNode {
  return (
    <VisualView family={family} state={state} size={size} {...(px === undefined ? {} : { px })} />
  );
}

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
