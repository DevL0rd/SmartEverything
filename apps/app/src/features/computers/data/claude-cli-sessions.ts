import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type ClaudeCliSession } from '@smarteverything/domain';
import { computerAiKey } from './computer-ai';
import { useClaudeCliOrigin } from './claude-cli-origin';

export function useClaudeCliSessions(
  deviceId: string,
  archived: boolean,
  enabled: boolean,
): ReturnType<typeof useQuery<ClaudeCliSession[]>> {
  const origin = useClaudeCliOrigin();
  return useQuery({
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
