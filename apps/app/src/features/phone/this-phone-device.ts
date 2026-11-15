import { useActiveProfile } from '../../store/people';
import { useMatchingDevices, useSession } from '../../store/selectors';
import type { Device } from '../../store/state';

export function useIsThisPhone(device: Device): boolean {
  const session = useSession();
  return device.kind === 'phone' && device.details['clientId'] === session.client.id;
}

export function useMyPhone(): Device | null {
  const session = useSession();
  const profileId = useActiveProfile()?.id ?? null;
  const mine = useMatchingDevices(
    (device) => device.kind === 'phone' && device.details['profileId'] === profileId,
    { includeHidden: true },
  );
  return mine.find((device) => device.details['clientId'] === session.client.id) ?? mine[0] ?? null;
}
