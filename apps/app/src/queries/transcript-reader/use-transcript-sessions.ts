import { Logger } from '@smarteverything/logging';
import { type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../use-screen-query';
import type { TranscriptSession } from '@smarteverything/domain';
import { errorFields } from '../../design/log-tally';
import { listTranscriptSessions } from '../../api/transcripts';
import { TRANSCRIPT_SESSIONS_PREFIX } from './selection';

const SESSIONS_SHOWN = 200;

const log = new Logger('app.transcripts');

export function useTranscriptSessions(
  source: TranscriptSession['source'],
  pluginId: string,
  enabled: boolean,
): UseQueryResult<TranscriptSession[]> {
  return useScreenQuery({
    queryKey: [...TRANSCRIPT_SESSIONS_PREFIX, source, pluginId],
    queryFn: async () => {
      const startedAt = Date.now();
      try {
        const sessions = await listTranscriptSessions({ source, pluginId, limit: SESSIONS_SHOWN });
        log.debug('transcript_sessions.listed', () => ({
          source,
          pluginId,
          sessions: sessions.length,
          durationMs: Date.now() - startedAt,
        }));
        return sessions;
      } catch (error) {
        log.warn('transcript_sessions.failed', {
          source,
          pluginId,
          durationMs: Date.now() - startedAt,
          ...errorFields(error),
        });
        throw error;
      }
    },
    enabled,
    gcTime: 0,
  });
}
