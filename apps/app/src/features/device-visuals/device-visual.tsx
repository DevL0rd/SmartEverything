import { deviceFamily, type DeviceFamily } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { use } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import type { Device } from '../../store/state';
import { useButtonVisualState, useHubVisualState } from './model/use-button-facts';
import {
  useDeviceVisualState,
  useScaleVisualState,
  useVacuumVisualState,
  useWatchVisualState,
} from './model/use-visual-state';
import { usePrinterFacts } from './model/use-printer-live';
import { ModelFrame } from './model-frame';
import { WidgetModelsContext } from './widget-models-context';
import type { VisualSize, VisualState, VisualTone } from './types';
import { FIXED_PX, SIZE_CLASS, useVisualPx, type VisualPx } from './visual-size';
import { CameraMedia } from './visuals/camera-media';

export function toneOf(state: VisualState): VisualTone {
  if (!state.online) {
    return 'offline';
  }
  return state.power === 'off' ? 'idle' : 'active';
}

interface VisualViewProps {
  readonly family: DeviceFamily;
  readonly device: Device | null;
  readonly state: VisualState;
  readonly size: VisualSize;
  readonly px?: VisualPx;
  readonly interactive: boolean;
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

function EmptyVisual({ px }: { readonly px: VisualPx }): ReactNode {
  return <View aria-hidden pointerEvents="none" className={cn('shrink-0', SIZE_CLASS[px])} />;
}

function SizedVisualView({
  family,
  device,
  state,
  size,
  px,
  interactive,
}: VisualViewProps & { readonly px: VisualPx }): ReactNode {
  const models = use(WidgetModelsContext);
  const plan = models === null ? null : models.planFor(device, family);
  if (plan === null) return <EmptyVisual px={px} />;
  return (
    <ModelFrame
      family={family}
      device={device}
      state={state}
      size={size}
      px={px}
      tone={toneOf(state)}
      plan={plan}
      interactive={interactive}
    />
  );
}

interface HostProps {
  readonly device: Device;
  readonly size: VisualSize;
  readonly interactive: boolean;
  readonly px?: VisualPx;
}

function PlainVisual(props: HostProps): ReactNode {
  const { device } = props;
  return (
    <VisualView {...props} family={deviceFamily(device)} state={useDeviceVisualState(device)} />
  );
}

function ScaleVisual(props: HostProps): ReactNode {
  return <VisualView {...props} family="scale" state={useScaleVisualState(props.device)} />;
}

function WatchVisual(props: HostProps): ReactNode {
  return <VisualView {...props} family="wearable" state={useWatchVisualState(props.device)} />;
}

function VacuumHost(props: HostProps): ReactNode {
  return <VisualView {...props} family="vacuum" state={useVacuumVisualState(props.device)} />;
}

function ButtonHost(props: HostProps): ReactNode {
  return <VisualView {...props} family="button" state={useButtonVisualState(props.device)} />;
}

function PrinterHost(props: HostProps): ReactNode {
  const { device } = props;
  const base = useDeviceVisualState(device);
  const printer = usePrinterFacts(device);
  const state: VisualState =
    printer === null ? base : { ...base, online: device.online, power: 'on', printer };
  return <VisualView {...props} family="printer" state={state} />;
}

function HubHost(props: HostProps): ReactNode {
  return <VisualView {...props} family="gateway" state={useHubVisualState(props.device)} />;
}

function CameraHost(props: HostProps): ReactNode {
  const { device, size } = props;
  const models = use(WidgetModelsContext);
  const modelled = !device.online && (models?.planFor(device, 'camera') ?? null) !== null;
  return modelled ? <PlainVisual {...props} /> : <CameraMedia device={device} size={size} />;
}

const HOSTS: Partial<Readonly<Record<DeviceFamily, (props: HostProps) => ReactNode>>> = {
  scale: ScaleVisual,
  wearable: WatchVisual,
  button: ButtonHost,
  vacuum: VacuumHost,
  gateway: HubHost,
  printer: PrinterHost,
  camera: CameraHost,
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
    <VisualView
      family={family}
      device={null}
      state={state}
      size={size}
      interactive={false}
      {...(px === undefined ? {} : { px })}
    />
  );
}

export interface DeviceVisualProps {
  readonly device: Device;
  readonly size: VisualSize;
  readonly state?: VisualState;
  readonly px?: VisualPx;
  readonly interactive?: boolean;
}

export function DeviceVisual({
  device,
  size,
  state,
  px,
  interactive = false,
}: DeviceVisualProps): ReactNode {
  const family = deviceFamily(device);
  if (state !== undefined) {
    return (
      <VisualView
        family={family}
        device={device}
        state={state}
        size={size}
        interactive={interactive}
        {...(px === undefined ? {} : { px })}
      />
    );
  }
  const Host = HOSTS[family] ?? PlainVisual;
  return (
    <Host
      device={device}
      size={size}
      interactive={interactive}
      {...(px === undefined ? {} : { px })}
    />
  );
}
