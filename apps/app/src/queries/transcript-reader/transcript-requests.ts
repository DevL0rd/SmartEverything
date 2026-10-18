import {
  API_ENDPOINTS as E,
  type TranscriptPage,
  type TranscriptRange,
} from '@smarteverything/domain';
import { api } from '../../api/transport';
import type { TranscriptSelection } from './selection';

export interface TranscriptPageRequest {
  readonly cursor?: string;
  readonly direction: 'before' | 'after';
  readonly words: string;
  readonly limit: number;
}

export function readTranscriptPage(
  selection: TranscriptSelection,
  request: TranscriptPageRequest,
): Promise<TranscriptPage> {
  const query = {
    ...selection,
    limit: request.limit,
    direction: request.direction,
    ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
  };
  return request.words === ''
    ? api().call(E.readCameraTranscriptFeed, { query })
    : api().call(E.searchCameraTranscriptFeed, { query: { ...query, q: request.words } });
}

export function readTranscriptRange(
  selection: TranscriptSelection,
  anchor: number,
  limit: number,
): Promise<TranscriptRange> {
  return api().call(E.readCameraTranscriptRange, { query: { ...selection, anchor, limit } });
}
