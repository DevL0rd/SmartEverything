import type { z } from 'zod';
import type { InfiniteData } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E, type AiSubagent } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';

import { AGENT_RUN_PREFIX } from '../../../queries/keys';
import { background } from '@smarteverything/logging';
export function agentRunKey(chatId: string): readonly string[] {
  return [...AGENT_RUN_PREFIX, chatId];
}
export function useAgentRuns(chatId: string): ReturnType<typeof useRunPages> {
  return useRunPages(chatId, false);
}

function useRunPages(
  chatId: string,
  currentChildrenOnly: boolean,
): ReturnType<typeof useScreenInfiniteQuery<Awaited<ReturnType<typeof readRuns>>>> {
  return useScreenInfiniteQuery<
    z.output<typeof E.listAiAgentRuns.response>,
    Error,
    InfiniteData<z.output<typeof E.listAiAgentRuns.response>>,
    readonly string[],
    string | undefined
  >({
    queryKey: [...agentRunKey(chatId), currentChildrenOnly ? 'current-children' : 'list'],
    queryFn: ({ pageParam }) =>
      readRuns(chatId, currentChildrenOnly, typeof pageParam === 'string' ? pageParam : undefined),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

function readRuns(
  chatId: string,
  currentChildrenOnly: boolean,
  cursor: string | undefined,
): Promise<z.output<typeof E.listAiAgentRuns.response>> {
  return api().call(E.listAiAgentRuns, {
    params: { chatId },
    query: {
      limit: 50,
      ...(currentChildrenOnly ? { current_children_only: true } : {}),
      ...(cursor === undefined ? {} : { cursor }),
    },
  });
}
export function useAgentRun(
  chatId: string,
  agentRunId: string | null,
  cursor?: string,
): ReturnType<typeof useScreenQuery<Awaited<ReturnType<typeof readRun>>>> {
  return useScreenQuery({
    queryKey: [...agentRunKey(chatId), 'detail', agentRunId, cursor],
    queryFn: () => {
      if (agentRunId === null) throw new Error('An agent run must be selected.');
      return readRun(chatId, agentRunId, cursor);
    },
    enabled: agentRunId !== null,
  });
}
function readRun(
  chatId: string,
  agentRunId: string,
  cursor?: string,
): Promise<z.output<typeof E.readAiAgentRun.response>> {
  return api().call(E.readAiAgentRun, {
    params: { chatId, agentRunId },
    query: { limit: 100, ...(cursor === undefined ? {} : { cursor }) },
  });
}
export function useLaunchAgent(
  chatId: string,
): ReturnType<typeof useMutation<Awaited<ReturnType<typeof launch>>, Error, AiSubagent>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AiSubagent) => launch(chatId, body),
    onSuccess: () => {
      background(
        client.invalidateQueries({ queryKey: agentRunKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => notify({ message: 'Helper wasn’t started', error, tone: 'critical' }),
  });
}
function launch(
  chatId: string,
  body: AiSubagent,
): Promise<z.output<typeof E.runAiSubagent.response>> {
  return api().call(E.runAiSubagent, { params: { chatId }, body });
}
export function useInterruptAgent(
  chatId: string,
  agentRunId: string,
): ReturnType<typeof useMutation<unknown, Error, void>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api().call(E.controlAiAgentRun, {
        params: { chatId, agentRunId },
        body: { action: 'interrupt' },
      }),
    onSuccess: () => {
      background(
        client.invalidateQueries({ queryKey: agentRunKey(chatId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) => notify({ message: 'Helper wasn’t interrupted', error, tone: 'critical' }),
  });
}
