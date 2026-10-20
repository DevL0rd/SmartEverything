import { useScreenQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E, type ClaudeCliSession } from '@smarteverything/domain';
import { computerAiKey } from '../../../queries/keys';
import { useClaudeCliOrigin } from './claude-cli-origin';

export function useClaudeCliSessions(
  deviceId: string,
  archived: boolean,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<ClaudeCliSession[]>> {
  const origin = useClaudeCliOrigin();
  return useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'cli-sessions', ...origin.key, String(archived)],
    enabled,
    queryFn: async () => {
      origin.assertCurrent();
      const sessions = await origin.requester.call(E.listClaudeCliSessions, {
        params: { deviceId },
        query: { archived, limit: 100 },
      });
      origin.assertCurrent();
      return sessions;
    },
  });
}
