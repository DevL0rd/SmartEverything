import type { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  CLAUDE_OPERATION_ACCEPTED,
  type ClaudeOperation,
  type CODEX_OPERATION,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { computerAiKey } from './computer-ai';

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
    super('A correlated native operation ID is required to check its status.');
  }
}

export function useNativeOperation(deviceId: string, result: unknown): NativeOperationState {
  const accepted = nativeReceipt(result);
  const query = useQuery({
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
      void query.refetch();
    },
  };
}
