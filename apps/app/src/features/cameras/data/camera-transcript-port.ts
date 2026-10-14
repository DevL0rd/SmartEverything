import { API_ENDPOINTS as E, type TranscriptPage } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type {
  TranscriptFeedPort,
  TranscriptPageRequest,
} from '../../../components/transcript-feed';

export function cameraTranscriptPort(cameraId?: string): TranscriptFeedPort {
  const scope = cameraId === undefined ? {} : { cameraId };
  return {
    source: 'camera',
    scope: cameraId ?? 'all',
    read: (request: TranscriptPageRequest): Promise<TranscriptPage> => {
      const query = {
        ...scope,
        limit: request.limit,
        direction: request.direction,
        ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      };
      return request.words === ''
        ? api().call(E.readCameraTranscriptFeed, { query })
        : api().call(E.searchCameraTranscriptFeed, { query: { ...query, q: request.words } });
    },
    range: (anchor, limit) =>
      api().call(E.readCameraTranscriptRange, { query: { ...scope, anchor, limit } }),
  };
}
