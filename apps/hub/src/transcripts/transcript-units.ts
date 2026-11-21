import type { TranscriptDetail } from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { TranscriptFeedQuery, TranscriptScope } from '../store/repositories/transcript-reader';

export const TRANSCRIPT_DETAIL_UNIT = storeUnit(
  (
    store,
    ask: { readonly sessionId: string; readonly after: number; readonly limit: number },
  ): TranscriptDetail => {
    const session = store.transcripts.byId(ask.sessionId);
    const lines = store.transcripts.lines(ask.sessionId, ask.after, ask.limit + 1);
    return { session, lines: lines.slice(0, ask.limit), more: lines.length > ask.limit };
  },
);

export const TRANSCRIPT_FEED_UNIT = storeUnit(
  (store, ask: { readonly scope: TranscriptScope; readonly query: TranscriptFeedQuery }) =>
    store.transcripts.reader.feed(ask.scope, ask.query),
);

export const TRANSCRIPT_RANGE_UNIT = storeUnit(
  (
    store,
    ask: { readonly scope: TranscriptScope; readonly anchor: number; readonly limit: number },
  ) => store.transcripts.reader.range(ask.scope, ask.anchor, ask.limit),
);
