import { Logger, background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import type { TranscriptHit, TranscriptSession } from '@smarteverything/domain';
import { deleteTranscript, deleteTranscriptLine } from '../../api/transcripts';
import { confirm } from '../../components/confirm-store';
import { notify } from '../../components/toast-store';
import type { TranscriptRemoval } from '../../components/transcript-feed/state';
import { errorFields } from '../../design/log-tally';
import { useIsOwner } from '../../store/selectors';
import { TRANSCRIPT_READER_PREFIX, TRANSCRIPT_SESSIONS_PREFIX } from './selection';

const log = new Logger('app.transcripts');

interface Removal {
  readonly what: 'line' | 'session';
  readonly request: Parameters<typeof confirm>[0];
  readonly remove: () => Promise<void>;
  readonly failure: string;
}

async function removeConfirmed(
  client: ReturnType<typeof useQueryClient>,
  { what, request, remove, failure }: Removal,
): Promise<void> {
  const accepted = await confirm(request);
  log.debug('transcript_removal.confirmed', { what, accepted });
  if (!accepted) return;
  const startedAt = Date.now();
  try {
    await remove();
    await Promise.all([
      client.invalidateQueries({ queryKey: TRANSCRIPT_READER_PREFIX }),
      client.invalidateQueries({ queryKey: TRANSCRIPT_SESSIONS_PREFIX }),
    ]);
    log.info('transcript_removal.finished', { what, durationMs: Date.now() - startedAt });
  } catch (error) {
    log.warn('transcript_removal.failed', {
      what,
      durationMs: Date.now() - startedAt,
      ...errorFields(error),
    });
    notify({ message: failure, error, tone: 'critical' });
  }
}

export function useTranscriptRemoval(): TranscriptRemoval | undefined {
  const owner = useIsOwner();
  const client = useQueryClient();
  if (!owner) return undefined;
  const run = (
    what: Removal['what'],
    request: Removal['request'],
    remove: Removal['remove'],
    failure: string,
  ): Promise<void> => removeConfirmed(client, { what, request, remove, failure });
  return {
    line: (hit: TranscriptHit): void => {
      background(
        run(
          'line',
          {
            title: 'Delete this line?',
            body: 'Only this line is removed for good. The rest of the transcript stays.',
            confirmLabel: 'Delete line',
            tone: 'destructive',
          },
          () => deleteTranscriptLine(hit.session.id, hit.line.id),
          'The line wasn’t deleted',
        ),
        'use_transcript_removal.run_failed',
      );
    },
    session: (session: TranscriptSession): void => {
      background(
        run(
          'session',
          {
            title: 'Delete this whole transcript?',
            body: `All ${String(session.line_count)} lines in “${session.title}” are removed for good.`,
            confirmLabel: 'Delete transcript',
            tone: 'destructive',
          },
          () => deleteTranscript(session.id),
          'The transcript wasn’t deleted',
        ),
        'use_transcript_removal.run_failed',
      );
    },
  };
}
