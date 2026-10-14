import type { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { CODEX_OPERATION, type CodexAiReply, type CodexAiExecute } from '@smarteverything/domain';
import { readCodex, runtimeKey } from './computer-runtime';
import type { NativeOperationState } from './native-operation';
export function useCodexOperation(
  deviceId: string,
  result: CodexAiReply | undefined,
  request?: CodexAiExecute,
  failure?: Error | null,
): NativeOperationState {
  const receipt = receivedOperation(result, request, failure);
  const query = useQuery({
    queryKey: [...runtimeKey(deviceId), 'operation', receipt?.id ?? 'none'],
    enabled: false,
    initialData: receipt ?? undefined,
    queryFn: async () => {
      if (receipt === null) throw new Error('No operation receipt was returned.');
      const reply = await readCodex(deviceId, {
        operation: 'native_operation',
        operation_id: receipt.id,
      });
      if (reply.operation !== 'native_operation') throw new Error('Expected an operation receipt.');
      return reply.value;
    },
  });
  const current = query.data ?? receipt;
  return {
    receipt: current,
    blocked: current?.state === 'pending' || current?.state === 'uncertain',
    checking: query.isFetching,
    error: query.error,
    check: (): void => {
      void query.refetch();
    },
  };
}

function receivedOperation(
  result: CodexAiReply | undefined,
  request: CodexAiExecute | undefined,
  failure: Error | null | undefined,
): z.output<typeof CODEX_OPERATION> | null {
  const accepted = CODEX_OPERATION.safeParse(
    result !== undefined &&
      typeof result.value === 'object' &&
      result.value !== null &&
      'native_operation' in result.value
      ? result.value.native_operation
      : null,
  );
  if (accepted.success) return accepted.data;
  if (
    failure === undefined ||
    failure === null ||
    request === undefined ||
    !('operation_id' in request)
  )
    return null;
  return {
    id: request.operation_id,
    operation: request.operation,
    state: 'uncertain',
    value: null,
    error: 'The connection failed before confirmation. Check this operation before another action.',
  };
}
