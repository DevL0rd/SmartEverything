import type { ListeningSource, ListeningView } from '@smarteverything/domain';
import { useDevices, useSession } from '../../../store/selectors';

export function useThisPhoneSource(view: ListeningView): ListeningSource | null {
  const session = useSession();
  const phone = useDevices({ includeHidden: true }).find(
    (device) => device.kind === 'phone' && device.details['clientId'] === session.client.id,
  );
  return view.sources.find((source) => source.key === phone?.id) ?? null;
}
