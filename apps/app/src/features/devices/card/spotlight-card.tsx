import { deviceCardOf } from '../../../plugins/device-contributions';
import type { ReactNode } from 'react';
import {
  frameClassOf,
  type FrameClass,
  type WidgetFrameBox,
  type WidgetSize,
} from '../../../components/widget-board';
import { useIdiom } from '../../../design/platform';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { renderFamilyFace } from '../../../app-shell/family-faces';
import { FAMILY_CARDS } from './family-cards';
import { GenericCardFace } from './generic-card-face';
import { nominalFrame } from './nominal-frame';
import { StandaloneShell } from './standalone-shell';

export interface DeviceSpotlightProps {
  readonly deviceId: string;
  readonly size: WidgetSize;
  readonly editing: boolean;
  readonly frame?: WidgetFrameBox;
}

function Body({
  device,
  size,
  frame,
  cls,
}: {
  readonly device: Device;
  readonly size: WidgetSize;
  readonly frame: WidgetFrameBox;
  readonly cls: FrameClass;
}): ReactNode {
  const { family } = deviceModelOf(device);
  const Face = FAMILY_CARDS[family];
  if (Face !== undefined) {
    return <Face device={device} cls={cls} frame={frame} size={size} />;
  }
  const registered = renderFamilyFace(family, device, cls);
  if (registered !== null) {
    return registered;
  }
  return <GenericCardFace device={device} cls={cls} frame={frame} size={size} />;
}

function DeviceSpotlightCard({
  device,
  size,
  editing,
  frame,
}: Omit<DeviceSpotlightProps, 'deviceId' | 'frame'> & {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
}): ReactNode {
  const cls = frameClassOf(frame);
  const plugin = deviceCardOf(device);
  return (
    <StandaloneShell
      device={device}
      editing={editing}
      quickControls={plugin?.quick !== undefined}
      padded
    >
      {plugin === undefined ? (
        <Body device={device} size={size} frame={frame} cls={cls} />
      ) : (
        (plugin.cell?.(device, frame, size) ?? plugin.render(device, size, true))
      )}
    </StandaloneShell>
  );
}

export function DeviceSpotlightWidget({
  deviceId,
  frame,
  ...card
}: DeviceSpotlightProps): ReactNode {
  const device = useDevice(deviceId);
  const idiom = useIdiom();
  return device === null ? null : (
    <DeviceSpotlightCard
      device={device}
      frame={frame ?? nominalFrame(card.size, idiom)}
      {...card}
    />
  );
}
