import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiHarnessCatalogue,
  type AiHarnessHost,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { rowsOf } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { workingTurns } from '../../../store/subscriptions';
import { harnessHostReason } from '../../assistant';
import { chatCounts, type ChatCounts } from '../model/chat-machine';
import { computerAiKey } from './computer-ai';
import { background } from '@smarteverything/logging';

function sameCounts(left: ChatCounts, right: ChatCounts): boolean {
  return left.running === right.running && left.total === right.total;
}

export function useChatCounts(deviceId: string): ChatCounts {
  return useStoreSelector(
    (state) => chatCounts(rowsOf(state.tables.ai_chats), workingTurns(state), deviceId),
    sameCounts,
    [deviceId],
  );
}

export function useRevokeComputer(
  deviceId: string,
  name: string,
): ReturnType<typeof useMutation<unknown, Error, void>> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api().call(E.revokeComputerNode, { params: { deviceId } }),
    onSuccess: () => {
      notify({ message: `${name}’s connection revoked`, tone: 'positive' });
      background(
        client.invalidateQueries({ queryKey: computerAiKey(deviceId) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error) =>
      notify({ message: `${name}’s connection wasn’t revoked`, error, tone: 'critical' }),
  });
}

export function runtimeHostOf(
  catalogue: AiHarnessCatalogue | undefined,
  deviceId: string,
): AiHarnessHost | null | undefined {
  if (catalogue === undefined) return undefined;
  return (
    catalogue.hosts.find(
      (host) => host.target.kind === 'device' && host.target.device_id === deviceId,
    ) ?? null
  );
}

export function runtimeLine(host: AiHarnessHost | null | undefined): string | undefined {
  if (host === undefined) return undefined;
  if (host === null) return 'Not reachable';
  const reason = harnessHostReason(host);
  if (reason !== null) return reason;
  const folder = host.workspace?.default_directory ?? host.workspace?.home_directory;
  return folder === undefined ? 'Ready' : `Ready · new chats start in ${folder}`;
}

export function claudeLine(
  supplying: boolean | undefined,
  models: number | undefined,
): string | undefined {
  if (supplying === undefined) return undefined;
  if (!supplying) return 'Off';
  return models === undefined ? 'Supplying models' : `Supplying ${plural(models, 'model')}`;
}

export function codexLine(status: ComputerRuntimeStatus | undefined): string | undefined {
  if (status?.settings.runtime !== 'codex') return undefined;
  return status.settings.settings.provider.enabled ? 'Supplying models' : 'Off';
}
