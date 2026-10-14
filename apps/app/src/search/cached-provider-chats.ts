import { agentRunKey } from '../features/assistant/data/agent-runs';
import { AI_AGENT_RUN_PAGE } from '@smarteverything/domain';
import { z } from 'zod';
import { codexProviderKey } from '../queries/codex-provider-events';
import { useQueries } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiChatRuntimeProvider,
  type AiAgentRun,
  type AiChatProvider,
} from '@smarteverything/domain';
import { api } from '../api/transport';
import { providerKey } from '../queries/keys';
import type { SearchChat } from './sources';
interface Cached {
  readonly chats: readonly SearchChat[];
  readonly states: readonly (AiChatProvider | AiChatRuntimeProvider | undefined)[];
  readonly result: readonly SearchChat[];
}
let cached: Cached | null = null;
function attach(
  chats: readonly SearchChat[],
  states: readonly (AiChatProvider | AiChatRuntimeProvider | undefined)[],
): readonly SearchChat[] {
  if (
    cached?.chats === chats &&
    cached.states.length === states.length &&
    states.every((state, index) => state === cached?.states[index])
  )
    return cached.result;
  let nativeIndex = 0;
  const result = chats.map((chat) =>
    chat.computer ? { ...chat, metadata: states[nativeIndex++]?.metadata ?? null } : chat,
  );
  cached = { chats, states, result };
  return result;
}
export function useCachedProviderChats(
  chats: readonly SearchChat[],
  owner: boolean,
): readonly SearchChat[] {
  const queries = useQueries({
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
    queries: chats.map((chat) => ({
      queryKey: [...agentRunKey(chat.id), 'list'],
      queryFn: async (): Promise<{
        pages: z.output<typeof AI_AGENT_RUN_PAGE>[];
        pageParams: undefined[];
      }> => ({
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
        queries.map((query) => query.data),
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
  readonly values: readonly unknown[];
  readonly result: readonly SearchChat[];
} | null = null;
function runsOf(value: unknown): readonly AiAgentRun[] | null {
  if (typeof value !== 'object' || value === null) return null;
  const saved = RUN_CACHE.get(value);
  if (saved !== undefined) return saved;
  const parsed = z.object({ pages: z.array(AI_AGENT_RUN_PAGE) }).safeParse(value);
  if (!parsed.success) return null;
  const runs = parsed.data.pages.flatMap((page) => page.runs);
  RUN_CACHE.set(value, runs);
  return runs;
}
function attachAgents(
  chats: readonly SearchChat[],
  values: readonly unknown[],
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
