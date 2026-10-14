import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type ComputerNativeMcpPolicy } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { computerAiKey } from './computer-ai';
import { useClaudeCliOrigin } from './claude-cli-origin';

export function useNativeMcpPolicy(
  deviceId: string,
): ReturnType<typeof useQuery<ComputerNativeMcpPolicy>> {
  const origin = useClaudeCliOrigin();
  return useQuery({
    queryKey: [...computerAiKey(deviceId), 'mcp-policy', 'claude', ...origin.key],
    queryFn: async (): Promise<ComputerNativeMcpPolicy> => {
      origin.assertCurrent();
      const policy = await origin.requester.call(E.readComputerNativeMcpPolicy, {
        params: { deviceId, runtime: 'claude' },
      });
      origin.assertCurrent();
      return policy;
    },
  });
}

export function useNativeMcpPolicyChange(
  deviceId: string,
): ReturnType<typeof useMutation<ComputerNativeMcpPolicy, Error, ComputerNativeMcpPolicy>> {
  const origin = useClaudeCliOrigin();
  const client = useQueryClient();
  const key = [...computerAiKey(deviceId), 'mcp-policy', 'claude', ...origin.key];
  return useMutation({
    mutationFn: async (body: ComputerNativeMcpPolicy): Promise<ComputerNativeMcpPolicy> => {
      origin.assertCurrent();
      const policy = await origin.requester.call(E.updateComputerNativeMcpPolicy, {
        params: { deviceId, runtime: 'claude' },
        body,
      });
      origin.assertCurrent();
      return policy;
    },
    onSuccess: (policy): void => {
      origin.assertCurrent();
      client.setQueryData(key, policy);
    },
    onError: (error): void => {
      notify({ message: 'Native home-tool access wasn’t changed', error, tone: 'critical' });
    },
  });
}
