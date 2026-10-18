import { Logger, background } from '@smarteverything/logging';
import {
  CancelledError,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';
import {
  AI_REFERENCE_ENDPOINTS as E,
  type AiChatRow,
  type AiReferenceSearchResult,
  type AiReferenceSummary,
  type AiReferenceSourceStatus,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { usePickerSession, type PickerSession } from '../picker/model-search-session';
import { useDshCommandBinding } from '../commands/dsh-binding';
import { REFERENCE_ORDER } from './presentation';
import type { ReferenceIntent } from './intent';
import { searchReason, type SearchReason } from './reason';

const log = new Logger('app.search');
const SEARCH_DELAY_MS = 250;
const REFERENCE_PAGE_SIZE = 20;
const FIRST_PAGE: string | null = null;

export interface ReferenceSearch {
  readonly key: string;
  readonly items: readonly AiReferenceSummary[];
  readonly sources: readonly AiReferenceSourceStatus[];
  readonly reason: SearchReason | null;
  readonly pending: boolean;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly incomplete: boolean;
  readonly next: () => void;
  readonly valid: () => boolean;
}
type SearchQuery = UseInfiniteQueryResult<InfiniteData<AiReferenceSearchResult>>;
export function useReferenceSearch(
  chat: AiChatRow | undefined,
  intent: ReferenceIntent | null,
): ReferenceSearch {
  const session = usePickerSession();
  const binding = useDshCommandBinding(chat, intent !== null);
  const query = useDebouncedValue(intent?.query ?? '', SEARCH_DELAY_MS);
  const reason = searchReason(chat?.engine.kind, session.ready, binding.problem);
  const settled = query === intent?.query;
  const valid = session.valid;
  const key = JSON.stringify([session.key, binding.key, chat?.engine, query, intent !== null]);
  const result = useScreenInfiniteQuery({
    queryKey: ['window', 'ai-references', key],
    enabled: intent !== null && settled && reason === null,
    initialPageParam: FIRST_PAGE,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: ({ pageParam, signal }): Promise<AiReferenceSearchResult> =>
      readReferences(chat, session, { query, cursor: pageParam, signal, valid }),
    getNextPageParam: (page) => page.next_cursor,
  });
  return { ...searchResult(result, { key, reason, settled, opened: intent !== null }), valid };
}
async function readReferences(
  chat: AiChatRow | undefined,
  session: PickerSession,
  input: {
    readonly query: string;
    readonly cursor: string | null;
    readonly signal: AbortSignal;
    readonly valid: () => boolean;
  },
): Promise<AiReferenceSearchResult> {
  const { query, cursor, signal } = input;
  if (chat === undefined) throw new CancelledError({ silent: true });
  assertSearchActive(session, signal, input.valid);
  const startedAt = Date.now();
  log.debug('references.search_started', {
    chatId: chat.id,
    queryLength: query.length,
    paged: cursor !== null,
  });
  const result = await api()
    .call(
      E.searchAiChatReferences,
      {
        params: { chatId: chat.id },
        body: { query, limit: REFERENCE_PAGE_SIZE, ...(cursor === null ? {} : { cursor }) },
      },
      { signal },
    )
    .catch((error: unknown) => {
      log.warn('references.search_failed', {
        chatId: chat.id,
        queryLength: query.length,
        aborted: signal.aborted,
        error: error instanceof Error ? error.name : typeof error,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    });
  log.debug('references.search_finished', () => ({
    chatId: chat.id,
    queryLength: query.length,
    items: result.items.length,
    sources: result.sources.length,
    more: result.next_cursor !== null,
    durationMs: Date.now() - startedAt,
  }));
  assertSearchActive(session, signal, input.valid);
  return result;
}
function searchResult(
  result: SearchQuery,
  scope: {
    readonly key: string;
    readonly reason: SearchReason | null;
    readonly settled: boolean;
    readonly opened: boolean;
  },
): Omit<ReferenceSearch, 'valid'> {
  const pages = scope.settled && scope.reason === null ? (result.data?.pages ?? []) : [];
  const reason: SearchReason | null =
    result.error === null
      ? scope.reason
      : { kind: 'other', text: `References could not load: ${result.error.message}` };
  return {
    key: scope.key,
    items: pages
      .flatMap((page) => page.items)
      .sort(
        (left, right) =>
          REFERENCE_ORDER[left.reference.kind] - REFERENCE_ORDER[right.reference.kind],
      ),
    sources: pages[pages.length - 1]?.sources ?? [],
    reason,
    pending: searchPending(scope, reason, result.isPending),
    more: result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    incomplete: pages.some((page) => page.incomplete),
    next: nextPage(result),
  };
}
function nextPage(result: SearchQuery): () => void {
  return (): void => {
    if (result.hasNextPage && !result.isFetching)
      background(result.fetchNextPage(), 'next_page.fetch_failed');
  };
}
function assertSearchActive(
  session: PickerSession,
  signal: AbortSignal,
  valid: () => boolean,
): void {
  if (!session.valid() || signal.aborted || !valid()) throw new CancelledError({ silent: true });
}

function searchPending(
  scope: { readonly opened: boolean; readonly settled: boolean },
  reason: SearchReason | null,
  pending: boolean,
): boolean {
  return scope.opened && reason === null && (!scope.settled || pending);
}
