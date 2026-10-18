import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import type { Device } from '../../../store/state';
import { NowPlayingRow, useMedia } from '../components/now-playing';
import { VolumeRow } from '../components/volume-row';
import { useComputerSelect } from '../data/computer-metrics';

export function NowPlayingCard({
  deviceId,
  disabled,
}: {
  readonly deviceId: string;
  readonly disabled: boolean;
}): ReactNode {
  const media = useMedia(deviceId);
  return media === null ? null : (
    <Card>
      <NowPlayingRow deviceId={deviceId} disabled={disabled} compact={false} />
    </Card>
  );
}

export function VolumeCard({
  device,
  disabled,
}: {
  readonly device: Device;
  readonly disabled: boolean;
}): ReactNode {
  const known = useComputerSelect(device.id, (parts) => (parts.session?.volume ?? null) !== null);
  return known ? (
    <Card title="Volume">
      <VolumeRow device={device} label={device.label} disabled={disabled} />
    </Card>
  ) : null;
}
