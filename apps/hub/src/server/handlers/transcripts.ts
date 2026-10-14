import { admitLegacyTranscript, legacyTranscriptFilter } from '../../transcripts/legacy-reader';
import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { cameraReaderScope } from '../../transcripts/camera-reader';
import type { Store } from '../../store/store';
import type { CameraListening } from '../../transcripts/camera-listening';
import { ownerProfileOf } from '../../transcripts/owner';
import type { Transcripts } from '../../transcripts/transcript-service';
import { profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound, type Bound } from '../router';

type TranscriptRouteName =
  | 'readCameraTranscriptFeed'
  | 'searchCameraTranscriptFeed'
  | 'readCameraTranscriptRange'
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

function cameraTranscriptRoutes(
  store: Store,
  transcripts: Transcripts,
): Pick<
  TranscriptRoutes,
  'readCameraTranscriptFeed' | 'searchCameraTranscriptFeed' | 'readCameraTranscriptRange'
> {
  return {
    readCameraTranscriptFeed: bound(E.readCameraTranscriptFeed, ({ query, caller }) =>
      transcripts.feed(cameraReaderScope(store, caller, query.cameraId), query),
    ),
    searchCameraTranscriptFeed: bound(E.searchCameraTranscriptFeed, ({ query, caller }) =>
      transcripts.feed(cameraReaderScope(store, caller, query.cameraId), {
        ...query,
        words: query.q,
      }),
    ),
    readCameraTranscriptRange: bound(E.readCameraTranscriptRange, ({ query, caller }) =>
      transcripts.range(
        cameraReaderScope(store, caller, query.cameraId),
        query.anchor,
        query.limit,
      ),
    ),
  };
}

export function transcriptRoutes(
  store: Store,
  transcripts: Transcripts,
  listening: CameraListening,
): TranscriptRoutes {
  return {
    ...cameraTranscriptRoutes(store, transcripts),
    listTranscripts: bound(E.listTranscripts, ({ query, caller }) => {
      ownerReader(store, caller);
      return transcripts.list({ ...query, ...legacyTranscriptFilter(caller, query) });
    }),
    readTranscript: bound(E.readTranscript, ({ params, query, caller }) => {
      ownerReader(store, caller);
      admitLegacyTranscript(caller, store.transcripts.byId(params.sessionId));
      return transcripts.read(params.sessionId, query.after ?? 0, query.limit);
    }),
    removeTranscript: bound(E.removeTranscript, ({ params, caller }) => {
      ownerReader(store, caller);
      admitLegacyTranscript(caller, store.transcripts.byId(params.sessionId));
      transcripts.remove(params.sessionId);
      return DONE_REPLY;
    }),
    searchTranscripts: bound(E.searchTranscripts, ({ query, caller }) => {
      ownerReader(store, caller);
      return transcripts.search({
        ...query,
        ...legacyTranscriptFilter(caller, query),
        words: query.q,
      });
    }),
    readTranscriptSettings: bound(E.readTranscriptSettings, ({ query, caller }) => {
      cameraReaderScope(store, caller, query.cameraId);
      return transcripts.settings();
    }),
    updateTranscriptSettings: bound(E.updateTranscriptSettings, ({ body, caller }) => {
      ownerReader(store, caller);
      return transcripts.updateSettings(body);
    }),
    readTranscriptStatus: bound(E.readTranscriptStatus, ({ query, caller }) => {
      const scope = cameraReaderScope(store, caller, query.cameraId);
      return listening.status(scope.kind === 'camera' ? scope.cameraIds : []);
    }),
  };
}
