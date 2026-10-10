import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import type { CameraListening } from '../../transcripts/camera-listening';
import { ownerProfileOf } from '../../transcripts/owner';
import type { Transcripts } from '../../transcripts/transcript-service';
import { profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound, type Bound } from '../router';

type TranscriptRouteName =
  | 'listTranscripts'
  | 'readTranscript'
  | 'removeTranscript'
  | 'searchTranscripts'
  | 'readTranscriptSettings'
  | 'updateTranscriptSettings'
  | 'readTranscriptStatus';

type TranscriptRoutes = Record<TranscriptRouteName, Bound>;

export function ownerReader(store: Store, caller: Caller): void {
  const owner =
    caller.kind === 'client' &&
    (caller.pluginRequester === undefined
      ? caller.pluginId === undefined
      : caller.pluginRequester === 'owner') &&
    caller.client.role === 'owner' &&
    profileIdOf(store, caller) === ownerProfileOf(store);
  if (!owner) {
    throw new ApiError('forbidden', 'Only the owner reads transcripts.');
  }
}

export function transcriptRoutes(
  store: Store,
  transcripts: Transcripts,
  listening: CameraListening,
): TranscriptRoutes {
  return {
    listTranscripts: bound(E.listTranscripts, ({ query, caller }) => {
      ownerReader(store, caller);
      return transcripts.list(query);
    }),
    readTranscript: bound(E.readTranscript, ({ params, query, caller }) => {
      ownerReader(store, caller);
      return transcripts.read(params.sessionId, query.after ?? 0, query.limit);
    }),
    removeTranscript: bound(E.removeTranscript, ({ params, caller }) => {
      ownerReader(store, caller);
      transcripts.remove(params.sessionId);
      return DONE_REPLY;
    }),
    searchTranscripts: bound(E.searchTranscripts, ({ query, caller }) => {
      ownerReader(store, caller);
      return transcripts.search({ ...query, words: query.q });
    }),
    readTranscriptSettings: bound(E.readTranscriptSettings, () => transcripts.settings()),
    updateTranscriptSettings: bound(E.updateTranscriptSettings, ({ body, caller }) => {
      ownerReader(store, caller);
      return transcripts.updateSettings(body);
    }),
    readTranscriptStatus: bound(E.readTranscriptStatus, () => listening.status()),
  };
}
