import type { ReactNode } from 'react';
import { Banner } from '../../../components/banner';
import { moment, relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useLastSeen } from '../model/last-seen';

export function useSeenLine(deviceId: string, prefixed: boolean): string | null {
  const seen = useLastSeen(deviceId);
  const now = useMinute();
  if (seen === null) {
    return null;
  }
  const ago = relative(seen.at, now);
  return prefixed ? `Seen ${ago}` : ago;
}

export function useOfflineLine(deviceId: string): string | null {
  const seen = useLastSeen(deviceId);
  const now = useMinute();
  const zone = useSettings().time_zone;
  if (seen === null) {
    return null;
  }
  const when = moment(seen.at, now, zone);
  return seen.wentOffline ? `Offline since ${when}` : `Last heard from ${when}`;
}

export function OfflineBanner({ device }: { readonly device: Device }): ReactNode {
  const line = useOfflineLine(device.id);
  if (device.online) {
    return null;
  }
  return (
    <Banner tone="warning" title={line ?? 'Offline'} body="Controls are paused until it's back." />
  );
}
