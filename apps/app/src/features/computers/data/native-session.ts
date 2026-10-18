import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type ClaudeThreadPage,
  type ComputerAiNativeTool,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { computerAiKey } from './computer-ai';

export function useNativeThread(
  deviceId: string,
  sessionId: string,
  before: string | undefined,
): ReturnType<typeof useScreenQuery<ClaudeThreadPage>> {
  return useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'session', sessionId, 'thread', before ?? 'latest'],
    queryFn: () =>
      api().call(E.listComputerClaudeThread, {
        params: { deviceId, sessionId },
        query: { limit: 50, ...(before === undefined ? {} : { before }) },
      }),
  });
}

export function useNativeTools(
  deviceId: string,
  sessionId: string,
): ReturnType<typeof useScreenQuery<ComputerAiNativeTool[]>> {
  return useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'session', sessionId, 'tools'],
    queryFn: () =>
      api().call(E.listComputerClaudeTools, { params: { deviceId }, query: { sessionId } }),
  });
}
