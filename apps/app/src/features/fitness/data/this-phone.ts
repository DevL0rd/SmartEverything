import type { HealthSourceRow } from '@smarteverything/domain';
import { useSession } from '../../../store/selectors';
import { useSources } from './sources';

export function useThisPhoneSource(): HealthSourceRow | null {
  const clientId = useSession().client.id;
  return useSources().find((source) => source.client_id === clientId) ?? null;
}
