import type { HealthSourceRow } from '@smarteverything/domain';
import { useSession } from '../../../store/selectors';
import { useActiveSources } from './sources';

export function useThisPhoneSource(): HealthSourceRow | null {
  const clientId = useSession().client.id;
  return useActiveSources().find((source) => source.client_id === clientId) ?? null;
}
