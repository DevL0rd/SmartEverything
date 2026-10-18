import { memo, type ReactNode } from 'react';
import { useIdiom } from '../../../design/platform';
import type { Device } from '../../../store/state';
import {
  DeviceVisual,
  useDeviceVisualState,
  type VisualPx,
  type VisualState,
} from '../../device-visuals';
import { usePhoneSection } from '../data/phone-detail';

const POINTER_PX: VisualPx = 72;
const TOUCH_PX: VisualPx = 96;
const TALL_PX: VisualPx = 72;

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
  tall,
}: {
  readonly device: Device;
  readonly foldable: boolean;
  readonly tall: boolean;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  let px = touch ? TOUCH_PX : POINTER_PX;
  if (tall) px = TALL_PX;
  return foldable ? <FoldableArt device={device} px={px} /> : <PlainArt device={device} px={px} />;
});
