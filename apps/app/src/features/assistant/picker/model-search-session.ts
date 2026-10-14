import { useConnection } from '../../../api/transport';
import { connectionState } from '../../../api/connection/connection';
import { useEntityStore } from '../../../store/store-context';
import { useSession, useSyncStatus } from '../../../store/selectors';

export interface PickerSession {
  readonly key: string;
  readonly ready: boolean;
  readonly valid: () => boolean;
}
export function usePickerSession(): PickerSession {
  const store = useEntityStore();
  const session = useSession();
  const sync = useSyncStatus();
  const connection = useConnection();
  const url = connection.status === 'paired' ? connection.connection.url : '';
  return {
    key: JSON.stringify([url, session.client.id, session.client.profile_id]),
    ready: connection.status === 'paired' && sync.status === 'live',
    valid: (): boolean =>
      store.get().session === session &&
      store.get().sync.status === 'live' &&
      connectionState.get() === connection,
  };
}
export class ModelSearchSessionChangedError extends Error {
  override readonly name = 'ModelSearchSessionChangedError';
  constructor() {
    super('The model search session changed. Open the model menu again.');
  }
}
