import type { ReactNode } from 'react';
import type { WidgetFrameBox } from '../../components/widget-board';
import type { Device } from '../../store/state';
import { PresenceTile } from './presence-tile';
import { PresenceWideCard } from './presence-wide-card';

export function PresenceCard({
  device,
  frame,
  showRoom = true,
}: {
  readonly device: Device;
  readonly frame?: WidgetFrameBox;
  readonly showRoom?: boolean;
}): ReactNode {
  return frame === undefined ? (
    <PresenceTile device={device} showRoom={showRoom} />
  ) : (
    <PresenceWideCard device={device} frame={frame} showRoom={showRoom} />
  );
}
