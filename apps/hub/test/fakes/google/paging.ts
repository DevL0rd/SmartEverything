import { apiFailure, type HttpFailure } from './reply';

export interface FeedRequest {
  readonly feed: string;
  readonly epoch: number;
  readonly currentRev: number;
  readonly syncToken: string | null;
  readonly pageToken: string | null;
  readonly maxResults: number;
  readonly showDeleted: boolean;
  readonly signature: string;
}

export interface FeedPage<T> {
  readonly items: readonly T[];
  readonly nextPageToken: string | null;
  readonly nextSyncToken: string | null;
}

interface Cursor {
  readonly since: number;
  readonly upTo: number;
  readonly offset: number;
  readonly includeDeleted: boolean;
}

interface SyncToken {
  readonly feed: string;
  readonly epoch: number;
  readonly rev: number;
  readonly signature: string;
}

interface PageToken extends SyncToken {
  readonly since: number;
  readonly offset: number;
  readonly includeDeleted: boolean;
}

const SYNC_PREFIX = 'fake-sync';
const PAGE_PREFIX = 'fake-page';

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function whole(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

function encodeSync(token: SyncToken): string {
  return [SYNC_PREFIX, encode(token.feed), token.epoch, token.rev, encode(token.signature)].join(
    ':',
  );
}

function encodePage(token: PageToken): string {
  return [
    PAGE_PREFIX,
    encode(token.feed),
    token.epoch,
    token.rev,
    encode(token.signature),
    token.since,
    token.offset,
    token.includeDeleted ? 1 : 0,
  ].join(':');
}

function decodeSync(text: string): SyncToken | null {
  const [prefix, feed, epoch, rev, signature, extra] = text.split(':');
  const parsedEpoch = whole(epoch);
  const parsedRev = whole(rev);
  if (prefix !== SYNC_PREFIX || extra !== undefined) return null;
  if (feed === undefined || signature === undefined) return null;
  if (parsedEpoch === null || parsedRev === null) return null;
  return { feed: decode(feed), epoch: parsedEpoch, rev: parsedRev, signature: decode(signature) };
}

function decodePage(text: string): PageToken | null {
  const [prefix, feed, epoch, rev, signature, since, offset, deleted, extra] = text.split(':');
  const base = decodeSync([SYNC_PREFIX, feed, epoch, rev, signature].join(':'));
  const parsedSince = whole(since);
  const parsedOffset = whole(offset);
  if (prefix !== PAGE_PREFIX || extra !== undefined || base === null) return null;
  if (parsedSince === null || parsedOffset === null) return null;
  if (deleted !== '0' && deleted !== '1') return null;
  return { ...base, since: parsedSince, offset: parsedOffset, includeDeleted: deleted === '1' };
}

export function fullSyncRequired(): HttpFailure {
  return apiFailure(
    410,
    'Sync token is no longer valid, a full sync is required.',
    'fullSyncRequired',
  );
}

function resolveContinuation(request: FeedRequest, pageToken: string): Cursor {
  const page = decodePage(pageToken);
  if (page === null) throw apiFailure(400, 'Invalid page token.', 'invalid');
  if (page.feed !== request.feed || page.epoch !== request.epoch) throw fullSyncRequired();
  if (page.signature !== request.signature) {
    throw apiFailure(400, 'Page token parameters differ from the request.', 'invalid');
  }
  if (request.syncToken !== null) {
    const sync = decodeSync(request.syncToken);
    if (sync?.feed !== request.feed || sync.epoch !== request.epoch) throw fullSyncRequired();
  }
  return {
    since: page.since,
    upTo: page.rev,
    offset: page.offset,
    includeDeleted: page.includeDeleted,
  };
}

function resolveIncremental(request: FeedRequest, syncToken: string): Cursor {
  const sync = decodeSync(syncToken);
  if (sync?.feed !== request.feed || sync.epoch !== request.epoch) throw fullSyncRequired();
  if (sync.signature !== request.signature) {
    throw apiFailure(400, 'Sync token parameters differ from the initial request.', 'invalid');
  }
  return { since: sync.rev, upTo: request.currentRev, offset: 0, includeDeleted: true };
}

function resolveCursor(request: FeedRequest): Cursor {
  if (request.pageToken !== null) return resolveContinuation(request, request.pageToken);
  if (request.syncToken !== null) return resolveIncremental(request, request.syncToken);
  return {
    since: 0,
    upTo: request.currentRev,
    offset: 0,
    includeDeleted: request.showDeleted,
  };
}

export function pageFeed<T extends { readonly rev: number }>(
  request: FeedRequest,
  entries: readonly T[],
  isDeleted: (entry: T) => boolean,
): FeedPage<T> {
  const cursor = resolveCursor(request);
  const window = entries
    .filter((entry) => entry.rev > cursor.since && entry.rev <= cursor.upTo)
    .filter((entry) => cursor.includeDeleted || !isDeleted(entry))
    .sort((a, b) => a.rev - b.rev);
  const items = window.slice(cursor.offset, cursor.offset + request.maxResults);
  const end = cursor.offset + items.length;
  const token: SyncToken = {
    feed: request.feed,
    epoch: request.epoch,
    rev: cursor.upTo,
    signature: request.signature,
  };
  if (end < window.length) {
    const next = encodePage({
      ...token,
      since: cursor.since,
      offset: end,
      includeDeleted: cursor.includeDeleted,
    });
    return { items, nextPageToken: next, nextSyncToken: null };
  }
  return { items, nextPageToken: null, nextSyncToken: encodeSync(token) };
}
