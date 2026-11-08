import type { z } from 'zod';
import type { InfiniteData } from '@tanstack/react-query';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { isActiveRun } from '../details/run-state';

import { AGENT_RUN_PREFIX } from '../../../queries/keys';
export function agentRunKey(chatId: string): readonly string[] {
  return [...AGENT_RUN_PREFIX, chatId];
}
export function useAgentActivity(parentId: string | null, chatId: string): string | null {
  const runs = useRunPages(parentId ?? '', parentId !== null);
  const run = runs.data?.pages
    .flatMap((page) => page.runs)
    .find((row) => row.child_chat_id === chatId && row.runtime !== 'dsh' && isActiveRun(row));
  const text = run?.progress?.trim() ?? '';
  return text === '' ? null : text;
}

function useRunPages(
  chatId: string,
  enabled: boolean,
): ReturnType<typeof useScreenInfiniteQuery<Awaited<ReturnType<typeof readRuns>>>> {
  return useScreenInfiniteQuery<
    z.output<typeof E.listAiAgentRuns.response>,
    Error,
    InfiniteData<z.output<typeof E.listAiAgentRuns.response>>,
    readonly string[],
    string | undefined
  >({
    queryKey: [...agentRunKey(chatId), 'list'],
    queryFn: ({ pageParam }) =>
      readRuns(chatId, typeof pageParam === 'string' ? pageParam : undefined),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled,
  });
}

function readRuns(
  chatId: string,
  cursor: string | undefined,
): Promise<z.output<typeof E.listAiAgentRuns.response>> {
  return api().call(E.listAiAgentRuns, {
    params: { chatId },
    query: {
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
    },
  });
}
