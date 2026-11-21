import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { CameraListening } from '../../transcripts/camera-listening';
import {
  admitTranscriptCaller,
  admitTranscriptReader,
  admitTranscriptSource,
  admittedSource,
  transcriptReaderScope,
} from '../../transcripts/reader-scope';
import type { Transcripts } from '../../transcripts/transcript-service';
import type { Store } from '../../store/store';
import type { Caller } from '../auth';
import { DONE_REPLY, bound } from '../router';

export function requireOwner(caller: Caller): void {
  const owner =
    caller.kind === 'client' &&
    caller.client.role === 'owner' &&
    (caller.pluginRequester === undefined
      ? caller.pluginId === undefined
      : caller.pluginRequester === 'owner');
  if (!owner) {
    throw new ApiError('forbidden', 'Only the owner changes transcripts.');
  }
}

const cameraFeedRoutes = (store: Store, transcripts: Transcripts) =>
  ({
    readCameraTranscriptFeed: bound(E.readCameraTranscriptFeed, async ({ query, caller }) =>
      transcripts.feed(await transcriptReaderScope(store, caller, query), query),
    ),
    searchCameraTranscriptFeed: bound(E.searchCameraTranscriptFeed, async ({ query, caller }) =>
      transcripts.feed(await transcriptReaderScope(store, caller, query), {
        ...query,
        words: query.q,
      }),
    ),
    readCameraTranscriptRange: bound(E.readCameraTranscriptRange, async ({ query, caller }) =>
      transcripts.range(
        await transcriptReaderScope(store, caller, query),
        query.anchor,
        query.limit,
      ),
    ),
  }) as const;

export const transcriptRoutes = (
  store: Store,
  transcripts: Transcripts,
  listening: Pick<CameraListening, 'status'>,
) =>
  ({
    ...cameraFeedRoutes(store, transcripts),
    listTranscripts: bound(E.listTranscripts, ({ query, caller }) => {
      admitTranscriptCaller(caller);
      const source = admittedSource(store.live.home, caller, query.source, query.sourceId);
      return transcripts.list({ ...query, source });
    }),
    readTranscript: bound(E.readTranscript, async ({ params, query, caller }) => {
      admitTranscriptCaller(caller);
      const session = await store.host.call('transcripts', 'byId', params.sessionId);
      admitTranscriptSource(store.live.home, caller, session.source, session.source_id);
      return transcripts.read(params.sessionId, query.after ?? 0, query.limit);
    }),
    removeTranscript: bound(E.removeTranscript, async ({ params, query, caller }) => {
      requireOwner(caller);
      if (query.lineId === undefined) await transcripts.remove(params.sessionId);
      else await transcripts.removeLine(params.sessionId, query.lineId);
      return DONE_REPLY;
    }),
    searchTranscripts: bound(E.searchTranscripts, ({ query, caller }) => {
      admitTranscriptCaller(caller);
      const source = admittedSource(store.live.home, caller, query.source, query.sourceId);
      return transcripts.search({ ...query, source, words: query.q });
    }),
    readTranscriptSettings: bound(E.readTranscriptSettings, ({ caller }) => {
      admitTranscriptReader(caller);
      return transcripts.settings();
    }),
    updateTranscriptSettings: bound(E.updateTranscriptSettings, ({ body, caller }) => {
      requireOwner(caller);
      return transcripts.updateSettings(body);
    }),
    readTranscriptStatus: bound(E.readTranscriptStatus, ({ query, caller }) => {
      admitTranscriptReader(caller);
      return listening.status(query.cameraId === undefined ? undefined : [query.cameraId]);
    }),
  }) as const;
