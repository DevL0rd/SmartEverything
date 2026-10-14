import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type QueryClient,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { ApiError, type ClaudeOperation } from '@smarteverything/domain';
import { rawErrorText } from '../../../format/errors';
import { computerAiKey } from './computer-ai';
import { nativeReceipt, useNativeOperation, type NativeOperationState } from './native-operation';

interface NativeActionOptions<TData, TVariables> {
  readonly deviceId: string;
  readonly kind: ClaudeOperation['operation'];
  readonly scope: string;
  readonly send: (variables: TVariables, operationId: string) => Promise<TData>;
  readonly onSuccess?: (result: TData) => void;
  readonly onError?: (error: Error) => void;
}

type NativeActionResult<TData, TVariables> = UseMutationResult<TData, Error, TVariables> & {
  readonly operation: NativeOperationState;
};

async function submitNativeAction<TData, TVariables>(
  options: NativeActionOptions<TData, TVariables>,
  variables: TVariables,
  save: (receipt: ClaudeOperation | null) => void,
): Promise<TData> {
  const pending: ClaudeOperation = {
    id: randomUUID(),
    operation: options.kind,
    state: 'pending',
    value: null,
    error: null,
  };
  save(pending);
  try {
    const result = await options.send(variables, pending.id);
    save(nativeReceipt(result));
    return result;
  } catch (error) {
    const rejected = error instanceof ApiError && error.status < 500;
    save({ ...pending, state: rejected ? 'failed' : 'uncertain', error: rawErrorText(error) });
    throw error;
  }
}

function saveNativeReceipt(
  client: QueryClient,
  deviceId: string,
  actionKey: readonly string[],
  value: ClaudeOperation | null,
): void {
  if (value === null) {
    client.setQueryData(actionKey, null);
    return;
  }
  const key = [...computerAiKey(deviceId), 'operation', value.id];
  const current = client.getQueryData<ClaudeOperation>(key);
  const terminal = current?.state === 'completed' || current?.state === 'failed';
  const next = terminal ? current : value;
  client.setQueryData(key, next);
  client.setQueryData(actionKey, next);
}

export function useNativeAction<TData, TVariables>(
  options: NativeActionOptions<TData, TVariables>,
): NativeActionResult<TData, TVariables> {
  const client = useQueryClient();
  const actionKey = [...computerAiKey(options.deviceId), 'action', options.scope];
  const action = useQuery<ClaudeOperation | null>({
    queryKey: actionKey,
    enabled: false,
    gcTime: Infinity,
    initialData: null,
    queryFn: () => Promise.resolve(client.getQueryData<ClaudeOperation | null>(actionKey) ?? null),
  });
  const receipt = action.data;
  const save = (value: ClaudeOperation | null): void => {
    saveNativeReceipt(client, options.deviceId, actionKey, value);
  };
  const mutation = useMutation({
    mutationFn: (variables: TVariables) => submitNativeAction(options, variables, save),
    retry: false,
    ...(options.onSuccess === undefined ? {} : { onSuccess: options.onSuccess }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
  const operation = useNativeOperation(
    options.deviceId,
    receipt === null ? null : { native_operation: receipt },
  );
  return { ...mutation, operation };
}
