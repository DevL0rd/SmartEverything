import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ClaudeControlled,
  type ClaudeOperation,
  type ClaudeControl,
  type ClaudePrompt,
  type ClaudeAnswer,
  type ClaudeThreadPage,
  type ComputerAiNativeTool,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useNativeAction } from './native-action';
import { computerAiKey } from './computer-ai';

export function useNativeThread(
  deviceId: string,
  sessionId: string,
  before: string | undefined,
): ReturnType<typeof useQuery<ClaudeThreadPage>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'session', sessionId, 'thread', before ?? 'latest'],
    queryFn: () =>
      api().call(E.listComputerClaudeThread, {
        params: { deviceId, sessionId },
        query: { limit: 50, ...(before === undefined ? {} : { before }) },
      }),
  });
}

export function useNativePrompts(
  deviceId: string,
  sessionId: string,
): ReturnType<typeof useQuery<ClaudePrompt[]>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'session', sessionId, 'prompts'],
    queryFn: () =>
      api().call(E.listComputerClaudePrompts, { params: { deviceId }, query: { sessionId } }),
  });
}

type NativeControlResult = ClaudeControlled | { readonly native_operation: ClaudeOperation };

function controlNative(
  deviceId: string,
  sessionId: string,
  body: ClaudeControl,
  operationId: string,
): Promise<NativeControlResult> {
  return api().call(E.controlComputerClaudeSession, {
    params: { deviceId, sessionId },
    body: { ...body, operation_id: operationId },
  });
}

export function useNativeControl(
  deviceId: string,
  sessionId: string,
  scope: 'controls' | 'model' | 'send',
): ReturnType<typeof useNativeAction<NativeControlResult, ClaudeControl>> {
  const client = useQueryClient();
  return useNativeAction({
    deviceId,
    kind: 'control',
    scope: `${sessionId}:${scope}`,
    send: (body: ClaudeControl, operationId) =>
      controlNative(deviceId, sessionId, body, operationId),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: computerAiKey(deviceId) });
      if ('delivery' in result && result.delivery === 'queued_unverified')
        notify({
          message: 'Queued on this computer; delivery is not confirmed yet',
          tone: 'default',
        });
    },
    onError: (error) =>
      notify({
        message: 'Native session outcome wasn’t confirmed',
        detail: 'Check the actual session before sending the action again.',
        error,
        tone: 'critical',
      }),
  });
}

export function useNativeAnswer(
  deviceId: string,
  promptId: string,
): ReturnType<typeof useMutation<ClaudePrompt, Error, ClaudeAnswer>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ClaudeAnswer) =>
      api().call(E.answerComputerClaudePrompt, { params: { deviceId, promptId }, body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: computerAiKey(deviceId) });
    },
    onError: (error) =>
      notify({ message: 'Claude prompt wasn’t answered', error, tone: 'critical' }),
  });
}

export function useNativeTools(
  deviceId: string,
  sessionId: string,
): ReturnType<typeof useQuery<ComputerAiNativeTool[]>> {
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'session', sessionId, 'tools'],
    queryFn: () =>
      api().call(E.listComputerClaudeTools, { params: { deviceId }, query: { sessionId } }),
  });
}
