import { memo, type ReactNode } from 'react';
import type { Device } from '../../../store/state';
import {
  DeviceVisual,
  useDeviceVisualState,
  type VisualPx,
  type VisualState,
} from '../../device-visuals';
import { usePhoneSection } from '../data/phone-detail';

function foldedState(base: VisualState, fold: 'open' | 'folded' | null): VisualState {
  return base.phone === undefined ? base : { ...base, phone: { ...base.phone, fold } };
}

function PlainArt({ device, px }: { readonly device: Device; readonly px: VisualPx }): ReactNode {
  return <DeviceVisual device={device} size="card" px={px} state={useDeviceVisualState(device)} />;
}

function FoldableArt({
  device,
  px,
}: {
  readonly device: Device;
  readonly px: VisualPx;
}): ReactNode {
  const fold = usePhoneSection(device.id, 'screen')?.fold ?? null;
  const state = foldedState(useDeviceVisualState(device), fold);
  return <DeviceVisual device={device} size="card" px={px} state={state} />;
}

export const PhoneArt = memo(function PhoneArt({
  device,
  foldable,
  px,
}: {
  readonly device: Device;
  readonly foldable: boolean;
  readonly px: VisualPx;
}): ReactNode {
  return foldable ? <FoldableArt device={device} px={px} /> : <PlainArt device={device} px={px} />;
});
