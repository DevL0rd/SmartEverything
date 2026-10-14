import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AI_HARNESS_ENDPOINTS,
  type AiHarnessPermissionChange,
  type AiHarnessSession,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { harnessKey } from './harness';

export function useChangeHarnessPermission(
  chatId: string,
): ReturnType<typeof useMutation<AiHarnessSession, Error, AiHarnessPermissionChange>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: AiHarnessPermissionChange) =>
      api().call(AI_HARNESS_ENDPOINTS.changeAiChatHarnessPermission, { params: { chatId }, body }),
    onSuccess: (session) => {
      client.setQueryData(harnessKey(chatId), session);
    },
    onError: () => client.invalidateQueries({ queryKey: harnessKey(chatId) }),
  });
}
