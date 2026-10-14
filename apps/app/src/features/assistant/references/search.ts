import {
  CancelledError,
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  AI_REFERENCE_ENDPOINTS as E,
  type AiChatRow,
  type AiReferenceSearchResult,
  type AiReferenceSummary,
  type AiReferenceSourceStatus,
} from '@smarteverything/domain';
import { api, useConnection } from '../../../api/transport';
import { useServerAiReferences } from '../../../api/connection/server-capabilities';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { usePickerSession, type PickerSession } from '../picker/model-search-session';
import { useDshCommandBinding } from '../commands/dsh-binding';
import { REFERENCE_ORDER } from './presentation';
import type { ReferenceIntent } from './intent';
const SEARCH_DELAY_MS = 250;
export const REFERENCE_PAGE_SIZE = 20;
export const REFERENCE_PAGES_MAX = 3;
export interface ReferenceSearch {
  readonly key: string;
  readonly items: readonly AiReferenceSummary[];
  readonly sources: readonly AiReferenceSourceStatus[];
  readonly reason: string | null;
  readonly pending: boolean;
  readonly more: boolean;
  readonly loadingMore: boolean;
  readonly incomplete: boolean;
  readonly next: () => void;
}
type SearchQuery = UseInfiniteQueryResult<InfiniteData<AiReferenceSearchResult>>;
export function useReferenceSearch(
  chat: AiChatRow | undefined,
  intent: ReferenceIntent | null,
): ReferenceSearch {
  const session = usePickerSession();
  const connection = useConnection();
  const supported = useServerAiReferences(
    connection.status === 'paired' ? connection.connection.url : null,
  );
  const binding = useDshCommandBinding(chat, intent !== null);
  const query = useDebouncedValue(intent?.query ?? '', SEARCH_DELAY_MS);
  const reason = searchReason(chat, session.ready, supported, binding.reason);
  const settled = query === intent?.query;
  const key = JSON.stringify([session.key, binding.key, chat?.engine, query]);
  const result = useInfiniteQuery({
    queryKey: ['window', 'ai-references', key],
    enabled: intent !== null && settled && reason === null,
    initialPageParam: initialCursor(),
    maxPages: REFERENCE_PAGES_MAX,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: ({ pageParam, signal }): Promise<AiReferenceSearchResult> =>
      readReferences(chat, session, { query, cursor: pageParam, signal }),
    getNextPageParam: (page) => page.next_cursor,
  });
  return searchResult(result, { key, reason, settled, opened: intent !== null });
}
function initialCursor(): string | null {
  return null;
}
async function readReferences(
  chat: AiChatRow | undefined,
  session: PickerSession,
  input: { readonly query: string; readonly cursor: string | null; readonly signal: AbortSignal },
): Promise<AiReferenceSearchResult> {
  const { query, cursor, signal } = input;
  if (chat === undefined) throw new CancelledError({ silent: true });
  assertSearchActive(session, signal);
  const result = await api().call(
    E.searchAiChatReferences,
    {
      params: { chatId: chat.id },
      body: { query, limit: REFERENCE_PAGE_SIZE, ...(cursor === null ? {} : { cursor }) },
    },
    { signal },
  );
  assertSearchActive(session, signal);
  return result;
}
function searchResult(
  result: SearchQuery,
  scope: {
    readonly key: string;
    readonly reason: string | null;
    readonly settled: boolean;
    readonly opened: boolean;
  },
): ReferenceSearch {
  const pages = scope.settled && scope.reason === null ? (result.data?.pages ?? []) : [];
  const reason =
    result.error === null ? scope.reason : `References could not load: ${result.error.message}`;
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
function searchReason(
  chat: AiChatRow | undefined,
  ready: boolean,
  supported: boolean,
  binding: string | null,
): string | null {
  if (!ready) return 'Reconnect to find references.';
  if (!supported) return 'Update the hub to find references.';
  if (chat === undefined) return 'Preparing this chat…';
  if (chat.engine.kind !== 'dsh' && chat.engine.kind !== 'openrouter')
    return 'References are unavailable for this runtime.';
  return binding === null ? null : binding.replaceAll('commands', 'references');
}

function nextPage(result: SearchQuery): () => void {
  return (): void => {
    if (result.hasNextPage && !result.isFetching) void result.fetchNextPage();
  };
}
function assertSearchActive(session: PickerSession, signal: AbortSignal): void {
  if (!session.valid() || signal.aborted) throw new CancelledError({ silent: true });
}

function searchPending(
  scope: { readonly opened: boolean; readonly settled: boolean },
  reason: string | null,
  pending: boolean,
): boolean {
  return scope.opened && reason === null && (!scope.settled || pending);
}
