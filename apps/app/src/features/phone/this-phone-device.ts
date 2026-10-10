import { useActiveProfile } from '../../store/people';
import { useDevices, useSession } from '../../store/selectors';
import type { Device } from '../../store/state';

export function useIsThisPhone(device: Device): boolean {
  const session = useSession();
  return device.kind === 'phone' && device.details['clientId'] === session.client.id;
}

export function useMyPhone(): Device | null {
  const session = useSession();
  const profileId = useActiveProfile()?.id ?? null;
  const mine = useDevices({ includeHidden: true }).filter(
    (device) => device.kind === 'phone' && device.details['profileId'] === profileId,
  );
  return mine.find((device) => device.details['clientId'] === session.client.id) ?? mine[0] ?? null;
}
