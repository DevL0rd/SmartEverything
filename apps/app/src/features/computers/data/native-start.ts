import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  API_ENDPOINTS as E,
  ApiError,
  type ClaudeCliReceipt,
  type ClaudeCliStart,
} from '@smarteverything/domain';
import { rawErrorText } from '../../../format/errors';
import { computerAiKey } from './computer-ai';
import {
  useClaudeCliOrigin,
  ClaudeCliOriginChangedError,
  type ClaudeCliOrigin,
} from './claude-cli-origin';

type CliSubmission =
  | {
      readonly state: 'pending' | 'unknown' | 'rejected';
      readonly operationId: string;
      readonly reason: string | null;
    }
  | { readonly state: 'received'; readonly receipt: ClaudeCliReceipt };
interface CliStartContext {
  readonly deviceId: string;
  readonly origin: ClaudeCliOrigin;
  readonly save: (value: CliSubmission) => void;
  readonly current: CliSubmission | null | undefined;
}
function operationIdOf(value: CliSubmission): string {
  return value.state === 'received' ? value.receipt.operation_id : value.operationId;
}
async function submit(
  context: CliStartContext,
  input: Omit<ClaudeCliStart, 'operation_id'>,
): Promise<ClaudeCliReceipt> {
  const { deviceId, origin, save, current } = context;
  if (current !== undefined && current !== null && current.state !== 'rejected')
    throw new ApiError(
      'conflict',
      'Reconcile the existing CLI start before starting another session.',
    );
  const operationId = randomUUID();
  origin.assertCurrent(operationId);
  save({ state: 'pending', operationId, reason: null });
  try {
    const receipt = await origin.requester.call(E.startClaudeCliSession, {
      params: { deviceId },
      body: { ...input, operation_id: operationId },
    });
    save({ state: 'received', receipt });
    return receipt;
  } catch (error) {
    if (error instanceof ClaudeCliOriginChangedError) throw error;
    save({
      state: error instanceof ApiError && error.status < 500 ? 'rejected' : 'unknown',
      operationId,
      reason: rawErrorText(error),
    });
    throw error;
  }
}
function saveSubmission(
  client: QueryClient,
  key: readonly (string | null)[],
  origin: ClaudeCliOrigin,
  value: CliSubmission,
): void {
  const operationId = operationIdOf(value);
  origin.assertCurrent(operationId);
  const current = client.getQueryData<CliSubmission | null>(key);
  if (
    value.state !== 'pending' &&
    (current === undefined || current === null || operationIdOf(current) !== operationId)
  )
    throw new ClaudeCliOriginChangedError(operationId);
  client.setQueryData(key, value);
}
export function useNativeStart(deviceId: string): {
  readonly mutation: ReturnType<
    typeof useMutation<ClaudeCliReceipt, Error, Omit<ClaudeCliStart, 'operation_id'>>
  >;
  readonly submission: CliSubmission | null;
  readonly checking: boolean;
  readonly checkError: Error | null;
  readonly check: () => void;
  readonly clear: () => void;
} {
  const client = useQueryClient();
  const origin = useClaudeCliOrigin();
  const key = [...computerAiKey(deviceId), 'cli-start', ...origin.key];
  const state = useQuery<CliSubmission | null>({
    queryKey: key,
    enabled: false,
    gcTime: Infinity,
    initialData: null,
    queryFn: () => Promise.resolve(null),
  });
  const save = (value: CliSubmission): void => {
    saveSubmission(client, key, origin, value);
    if (value.state === 'received')
      void client.invalidateQueries({
        queryKey: [...computerAiKey(deviceId), 'cli-sessions', ...origin.key],
      });
  };
  const mutation = useMutation({
    mutationFn: (input: Omit<ClaudeCliStart, 'operation_id'>) =>
      submit(
        { deviceId, origin, save, current: client.getQueryData<CliSubmission | null>(key) },
        input,
      ),
    retry: false,
  });
  const submission = state.data;
  const receipt = useStartReceipt({ deviceId, origin, save, current: submission }, key);
  return {
    mutation,
    submission,
    checking: receipt.isFetching,
    checkError: receipt.error,
    check: (): void => {
      void receipt.refetch();
    },
    clear: clearSubmission(client, key, { origin, current: submission }),
  };
}
function useStartReceipt(
  context: CliStartContext,
  key: readonly (string | null)[],
): ReturnType<typeof useQuery<ClaudeCliReceipt>> {
  const { deviceId, origin, save, current } = context;
  const operationId =
    current === null || current === undefined ? undefined : operationIdOf(current);
  return useQuery({
    queryKey: [...key, operationId ?? 'none'],
    enabled: false,
    queryFn: async () => {
      if (operationId === undefined)
        throw new ApiError('invalid_request', 'No CLI operation has been submitted.');
      origin.assertCurrent(operationId);
      const value = await origin.requester.call(E.readClaudeCliOperation, {
        params: { deviceId, operationId },
      });
      save({ state: 'received', receipt: value });
      return value;
    },
  });
}

function clearSubmission(
  client: QueryClient,
  key: readonly (string | null)[],
  context: Pick<CliStartContext, 'origin' | 'current'>,
): () => void {
  return (): void => {
    context.origin.assertCurrent();
    if (context.current?.state === 'received' && context.current.receipt.state === 'accepted')
      client.setQueryData(key, null);
  };
}
