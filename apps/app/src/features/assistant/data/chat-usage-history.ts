import {
  AI_USAGE_ENDPOINTS,
  USAGE_LEDGER_LIMIT,
  type AiChatRow,
  type UsageLedgerPage,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { ChartPoint } from '../../../components/charts/scale';
import { HOUR_MS } from '../../../format/time';
import { AI_USAGE_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { helperRuns } from '../model/chat-footer';

const MAX_LEDGER_PAGES = 8;
const NO_COST: CostRead = { points: [], partial: false };
const NO_HELPERS: readonly AiChatRow[] = [];

interface LedgerWindow {
  readonly from: string;
  readonly to: string;
}

interface CostRead {
  readonly points: readonly ChartPoint[];
  readonly partial: boolean;
}

interface CostCollection {
  readonly points: Map<number, number>;
  pagesLeft: number;
  partial: boolean;
}

interface ChatUsageHistory {
  readonly cost: readonly ChartPoint[];
  readonly helpers: readonly ChartPoint[];
  readonly costLoading: boolean;
  readonly costError: boolean;
  readonly costPartial: boolean;
  readonly helpersLoading: boolean;
  readonly helpersError: boolean;
  readonly helpersPartial: boolean;
}

async function addChatCosts(
  previous: CostCollection,
  chatId: string,
  window: LedgerWindow,
  signal: AbortSignal,
): Promise<CostCollection> {
  const result = { ...previous };
  let cursor: string | null = null;
  do {
    const page: UsageLedgerPage = await api().call(
      AI_USAGE_ENDPOINTS.listUsageLedger,
      {
        query: {
          ...window,
          chatId,
          limit: USAGE_LEDGER_LIMIT,
          ...(cursor === null ? {} : { cursor }),
        },
      },
      { signal },
    );
    result.pagesLeft -= 1;
    for (const row of page.rows) {
      if (row.cost_available === false) {
        result.partial = true;
        continue;
      }
      const at = Date.parse(row.at);
      result.points.set(at, (result.points.get(at) ?? 0) + row.cost_micros);
    }
    cursor = page.next_cursor;
  } while (cursor !== null && result.pagesLeft > 0);
  result.partial ||= cursor !== null;
  return result;
}

function lastActivity(chat: AiChatRow): number {
  const updated = Date.parse(chat.updated_at);
  return chat.last_message_at === null
    ? updated
    : Math.max(updated, Date.parse(chat.last_message_at));
}

async function readCosts(
  chat: AiChatRow,
  helpers: readonly AiChatRow[] | null,
  signal: AbortSignal,
): Promise<CostRead> {
  const now = Date.now();
  const from = now - HOUR_MS;
  const window = { from: new Date(from).toISOString(), to: new Date(now).toISOString() };
  const recent =
    helpers === null
      ? [chat]
      : helpers
          .filter((helper) => lastActivity(helper) >= from)
          .sort((left, right) => lastActivity(right) - lastActivity(left));
  let result: CostCollection = { points: new Map(), pagesLeft: MAX_LEDGER_PAGES, partial: false };
  for (const row of recent) {
    if (result.pagesLeft === 0) {
      result.partial = true;
      break;
    }
    result = await addChatCosts(result, row.id, window, signal);
  }
  return {
    points: [...result.points].sort(([left], [right]) => left - right).map(([t, v]) => ({ t, v })),
    partial: result.partial,
  };
}

export function useChatUsageHistory(chat: AiChatRow, enabled: boolean): ChatUsageHistory {
  const helperChats = useStoreSelector(
    (state) => (enabled ? helperRuns(state.tables.ai_chats.rows, chat.id) : NO_HELPERS),
    shallowEqual,
    [chat.id, enabled],
  );
  const helperIds = helperChats.map((helper) => helper.id).sort();
  const scope = enabled ? [chat.profile_id, chat.id] : [];
  const {
    data: direct = NO_COST,
    isLoading: costLoading,
    isError: costError,
  } = useScreenQuery({
    queryKey: [...AI_USAGE_PREFIX, 'chat-history', ...scope, 'direct'],
    enabled,
    queryFn: ({ signal }) => readCosts(chat, null, signal),
  });
  const {
    data: helpers = NO_COST,
    isLoading: helpersLoading,
    isError: helpersError,
  } = useScreenQuery({
    queryKey: [...AI_USAGE_PREFIX, 'chat-history', ...scope, 'helpers', helperIds],
    enabled: enabled && helperIds.length > 0,
    queryFn: ({ signal }) => readCosts(chat, helperChats, signal),
  });
  return {
    cost: direct.points,
    helpers: helpers.points,
    costLoading,
    costError,
    costPartial: direct.partial,
    helpersLoading,
    helpersError,
    helpersPartial: helpers.partial,
  };
}
