import { ApiError, hashClientToken } from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { connectionState } from '../../../api/connection/connection';
import { useEntityStore } from '../../../store/store-context';
import { useSession } from '../../../store/selectors';

export class ClaudeCliOriginChangedError extends Error {
  override readonly name = 'ClaudeCliOriginChangedError';
  constructor(readonly operationId: string | undefined) {
    super(
      `The chat changed before the reply arrived. Check the session before trying again.${operationId === undefined ? '' : ` Operation ${operationId}.`}`,
    );
  }
}
export interface ClaudeCliOrigin {
  readonly key: readonly (string | null)[];
  readonly requester: ReturnType<typeof api>;
  readonly assertCurrent: (operationId?: string) => void;
}
export function useClaudeCliOrigin(): ClaudeCliOrigin {
  const state = useConnection();
  const session = useSession();
  const store = useEntityStore();
  if (state.status !== 'paired')
    throw new ApiError('conflict', 'Pair with your home to use Claude sessions.');
  const connection = state.connection;
  const origin = session.client;
  return {
    key: [connection.url, hashClientToken(connection.token), origin.id, origin.profile_id],
    requester: api(),
    assertCurrent: (operationId): void => {
      const current = connectionState.get();
      const client = store.get().session?.client;
      if (
        current.status !== 'paired' ||
        current.connection !== connection ||
        client?.id !== origin.id ||
        client.profile_id !== origin.profile_id ||
        client.role !== origin.role
      )
        throw new ClaudeCliOriginChangedError(operationId);
    },
  };
}
