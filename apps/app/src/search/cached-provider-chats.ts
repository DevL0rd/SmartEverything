import { agentRunKey } from '../features/assistant/data/agent-runs';
import type { AI_AGENT_RUN_PAGE } from '@smarteverything/domain';
import type { z } from 'zod';
import { codexProviderKey } from '../queries/codex-provider-events';
import { useQueries, type InfiniteData } from '@tanstack/react-query';
import { useScreenPaused } from '../design/screen-pause';
import { sameJson } from '../store/same-json';
import {
  API_ENDPOINTS as E,
  type AiChatRuntimeProvider,
  type AiAgentRun,
  type AiChatProvider,
  type ProviderMetadata,
} from '@smarteverything/domain';
import { api } from '../api/transport';
import { providerKey } from '../queries/keys';
import type { SearchChat } from './sources';
type RunPages = InfiniteData<z.output<typeof AI_AGENT_RUN_PAGE>, string | undefined>;
type Metadata = ProviderMetadata | null | undefined;
interface Cached {
  readonly chats: readonly SearchChat[];
  readonly metadata: readonly Metadata[];
  readonly result: readonly SearchChat[];
}
let cached: Cached | null = null;
function sameMetadata(left: readonly Metadata[], right: readonly Metadata[]): boolean {
  return left.length === right.length && left.every((item, index) => sameJson(item, right[index]));
}
function attach(
  chats: readonly SearchChat[],
  metadata: readonly Metadata[],
): readonly SearchChat[] {
  if (cached?.chats === chats && sameMetadata(cached.metadata, metadata)) return cached.result;
  let nativeIndex = 0;
  const result = chats.map((chat) =>
    chat.computer ? { ...chat, metadata: metadata[nativeIndex++] ?? null } : chat,
  );
  cached = { chats, metadata, result };
  return result;
}
export function useCachedProviderChats(
  chats: readonly SearchChat[],
  owner: boolean,
): readonly SearchChat[] {
  const subscribed = !useScreenPaused();
  const queries = useQueries({
    subscribed,
    queries: chats
      .filter((chat) => chat.computer)
      .map((chat) => ({
        queryKey:
          chat.runtime === 'codex' ? codexProviderKey(chat.id) : [...providerKey(chat.id), 'state'],
        queryFn: (): Promise<AiChatProvider | AiChatRuntimeProvider> =>
          api().call(E.readAiChatProvider, { params: { chatId: chat.id } }),
        enabled: false,
      })),
  });
  const agents = useQueries({
    subscribed,
    queries: chats.map((chat) => ({
      queryKey: [...agentRunKey(chat.id), 'list'],
      queryFn: async (): Promise<RunPages> => ({
        pages: [
          await api().call(E.listAiAgentRuns, {
            params: { chatId: chat.id },
            query: { limit: 50 },
          }),
        ],
        pageParams: [undefined],
      }),
      enabled: false,
    })),
  });
  const records = owner
    ? attach(
        chats,
        queries.map((query) => query.data?.metadata),
      )
    : chats;
  return attachAgents(
    records,
    agents.map((query) => query.data),
  );
}
const RUN_CACHE = new WeakMap<object, readonly AiAgentRun[]>();
let agentCache: {
  readonly chats: readonly SearchChat[];
  readonly values: readonly (RunPages | undefined)[];
  readonly result: readonly SearchChat[];
} | null = null;
function runsOf(value: RunPages | undefined): readonly AiAgentRun[] | null {
  if (value === undefined) return null;
  const saved = RUN_CACHE.get(value);
  if (saved !== undefined) return saved;
  const runs = value.pages.flatMap((page) => page.runs);
  RUN_CACHE.set(value, runs);
  return runs;
}
function attachAgents(
  chats: readonly SearchChat[],
  values: readonly (RunPages | undefined)[],
): readonly SearchChat[] {
  if (
    agentCache?.chats === chats &&
    agentCache.values.length === values.length &&
    values.every((value, index) => value === agentCache?.values[index])
  )
    return agentCache.result;
  const result = chats.map((chat, index) => {
    const runs = runsOf(values[index]);
    return runs === null ? chat : { ...chat, agents: runs };
  });
  agentCache = { chats, values, result };
  return result;
}
