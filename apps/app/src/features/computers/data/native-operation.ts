import type { z } from 'zod';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  CLAUDE_OPERATION_ACCEPTED,
  type ClaudeOperation,
  type CODEX_OPERATION,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { computerAiKey } from '../../../queries/keys';
import { background } from '@smarteverything/logging';

export interface NativeOperationState {
  readonly receipt: ClaudeOperation | z.output<typeof CODEX_OPERATION> | null;
  readonly blocked: boolean;
  readonly checking: boolean;
  readonly error: Error | null;
  readonly check: () => void;
}

export function nativeReceipt(result: unknown): ClaudeOperation | null {
  const parsed = CLAUDE_OPERATION_ACCEPTED.safeParse(result);
  return parsed.success ? parsed.data.native_operation : null;
}

class NativeOperationMissingError extends Error {
  override readonly name = 'NativeOperationMissingError';
  constructor() {
    super('An operation ID is required to check its status.');
  }
}

export function useNativeOperation(deviceId: string, result: unknown): NativeOperationState {
  const accepted = nativeReceipt(result);
  const query = useScreenQuery({
    queryKey: [...computerAiKey(deviceId), 'operation', accepted?.id ?? 'none'],
    enabled: false,
    initialData: accepted ?? undefined,
    queryFn: () => {
      if (accepted === null) throw new NativeOperationMissingError();
      return api().call(E.readComputerClaudeOperation, {
        params: { deviceId, operationId: accepted.id },
      });
    },
  });
  const receipt = accepted === null ? null : (query.data ?? accepted);
  return {
    receipt,
    blocked: receipt?.state === 'pending' || receipt?.state === 'uncertain',
    checking: query.isFetching,
    error: query.error,
    check: (): void => {
      background(query.refetch(), 'query.refetch_failed');
    },
  };
}
