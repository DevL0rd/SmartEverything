import type { ListeningSource, ListeningView } from '@smarteverything/domain';
import { useFirstDevice, useSession } from '../../../store/selectors';

export function useThisPhoneSource(view: ListeningView): ListeningSource | null {
  const session = useSession();
  const phone = useFirstDevice(
    (device) => device.kind === 'phone' && device.details['clientId'] === session.client.id,
    { includeHidden: true },
  );
  return view.sources.find((source) => source.key === phone?.id) ?? null;
}
