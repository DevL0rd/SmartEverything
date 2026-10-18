import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  API_ENDPOINTS as E,
  type AiChatRow,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useActiveProfile } from '../../../store/people';
import { useIsOwner } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { nativeProviderContext, useNativeProvider } from './native-provider';
import { nativeCatalogueRevision, nativeRuntimeAdapter } from './native-registry';
import type { CommandBinding, NativeExpectation } from './types';
import { background } from '@smarteverything/logging';
export function useNativeCommandBinding(chat: AiChatRow | undefined): CommandBinding {
  const owner = useIsOwner();
  const profileId = useActiveProfile()?.id;
  const clientId = useStoreSelector((state) => state.session?.client.id);
  const native = nativeChat(chat);
  const provider = useNativeProvider(native, native !== undefined && owner);
  const runtime = useNativeRuntime(native, owner);
  return nativeBinding(
    { chat: native, clientId, profileId, state: provider.data, status: runtime.data, owner },
    provider,
    runtime,
  );
}
type NativeChat = AiChatRow & {
  readonly engine: Extract<AiChatRow['engine'], { readonly kind: 'codex' | 'claude' }>;
};
function nativeChat(chat: AiChatRow | undefined): NativeChat | undefined {
  const engine = chat?.engine;
  if (chat === undefined || (engine?.kind !== 'codex' && engine?.kind !== 'claude'))
    return undefined;
  return { ...chat, engine };
}
function useNativeRuntime(
  chat: NativeChat | undefined,
  owner: boolean,
): ReturnType<typeof useScreenQuery<ComputerRuntimeStatus>> {
  const deviceId = chat?.engine.device_id ?? '';
  const runtime = chat?.engine.kind ?? 'codex';
  return useScreenQuery({
    queryKey: ['window', 'computer-runtime', deviceId, runtime, 'status'],
    enabled: chat !== undefined && owner,
    queryFn: () => api().call(E.readComputerRuntime, { params: { deviceId, runtime } }),
  });
}
interface NativeInput {
  readonly chat: NativeChat | undefined;
  readonly clientId: string | undefined;
  readonly profileId: string | undefined;
  readonly state: ReturnType<typeof useNativeProvider>['data'];
  readonly status: ComputerRuntimeStatus | undefined;
  readonly owner: boolean;
}
function nativeBinding(
  input: NativeInput,
  provider: ReturnType<typeof useNativeProvider>,
  runtime: ReturnType<typeof useNativeRuntime>,
): CommandBinding {
  const expected = nativeExpectation(input);
  const identity = expected === null ? null : { ...expected, job_id: null };
  return {
    key: JSON.stringify([identity, input.chat?.engine, input.status?.online]),
    discoveryKey: nativeDiscoveryKey(input, expected, runtime.dataUpdatedAt),
    chatId: input.chat?.id ?? null,
    target: expected === null ? null : { kind: 'native', expected },
    reason: nativeBindingReason(input, expected, provider.error, runtime.error),
    retry: (): void => {
      background(provider.refetch(), 'provider.refetch_failed');
      background(runtime.refetch(), 'runtime.refetch_failed');
    },
  };
}
function nativeExpectation(input: NativeInput): NativeExpectation | null {
  const { chat, state, status, clientId } = input;
  if (chat === undefined || state === undefined || status === undefined || clientId === undefined)
    return null;
  const context = nativeProviderContext(state);
  if (context === null || state.job_id === null || state.session_id === null) return null;
  if (!sameNativeContext(chat, state, status, input.profileId)) return null;
  return {
    profile_id: chat.profile_id,
    client_id: clientId,
    chat_id: chat.id,
    device_id: state.device_id,
    runtime: chat.engine.kind,
    session_id: state.session_id,
    job_id: state.job_id,
    process_generation: context.process_generation,
    cwd: context.cwd,
    capability_revision: status.capabilities.capability_revision,
  };
}
function sameNativeContext(
  chat: NativeChat,
  state: NonNullable<NativeInput['state']>,
  status: ComputerRuntimeStatus,
  profileId: string | undefined,
): boolean {
  const context = nativeProviderContext(state);
  if (context === null) return false;
  const expected = [
    chat.engine.kind,
    chat.engine.device_id,
    chat.engine.device_id,
    chat.engine.device_id,
    state.session_id,
    chat.profile_id,
  ];
  const actual = [
    context.runtime,
    context.device_id,
    status.device_id,
    state.device_id,
    context.session_id,
    profileId,
  ];
  return (
    JSON.stringify(expected) === JSON.stringify(actual) &&
    status.runtime === chat.engine.kind &&
    state.runtime === chat.engine.kind &&
    (chat.engine.settings.cwd === undefined || chat.engine.settings.cwd === context.cwd)
  );
}
function nativeReason(input: NativeInput, expected: NativeExpectation | null): string | null {
  if (!input.owner) return 'Only the home owner can run commands here.';
  const { status, state } = input;
  if (status === undefined || state === undefined) return 'Finding commands…';
  return nativeStatusReason(status) ?? nativeStateReason(state, expected);
}
function nativeStatusReason(status: ComputerRuntimeStatus): string | null {
  if (!status.online) return 'Reconnect the selected computer to use commands.';
  if (
    !nativeRuntimeAdapter(status.runtime).revisions.includes(
      status.capabilities.capability_revision,
    ) ||
    !status.capabilities.operations.includes('provider_start')
  )
    return 'Update SmartEverything on the selected computer to use commands.';
  if (!status.settings.settings.provider.enabled || status.capabilities.provider_reason !== null)
    return (
      status.capabilities.provider_reason ??
      'Turn on Claude or Codex on the selected computer to use commands.'
    );
  return null;
}
function nativeStateReason(
  state: NonNullable<NativeInput['state']>,
  expected: NativeExpectation | null,
): string | null {
  if (state.state === 'unknown')
    return (
      state.reason ?? 'The last command may not have finished. Refresh commands, then try again.'
    );
  if (
    !['idle', 'completed', 'interrupted'].includes(state.state) ||
    state.prompts.some((prompt) => prompt.status === 'pending')
  )
    return 'Wait for the current work and questions to finish before running commands.';
  return expected === null
    ? 'Commands become available after this chat has a Claude or Codex session.'
    : null;
}

function nativeDiscoveryKey(
  input: NativeInput,
  expected: NativeExpectation | null,
  revision: number,
): string {
  return JSON.stringify([
    expected,
    input.state?.state,
    input.state?.prompts,
    nativeCatalogueRevision(input.state),
    revision,
  ]);
}
function nativeBindingReason(
  input: NativeInput,
  expected: NativeExpectation | null,
  providerError: Error | null,
  runtimeError: Error | null,
): string | null {
  return providerError?.message ?? runtimeError?.message ?? nativeReason(input, expected);
}
