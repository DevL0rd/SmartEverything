import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type AiChatRow,
  type AiChatRuntimeProvider,
  type AiChatProvider,
  type ProviderExecutionContext,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useCodexProvider } from '../provider/codex-provider-data';
import { mergeProviderSnapshot } from '../../../queries/provider-notices';
import { nativeRuntimeAdapter } from './native-registry';
export function useNativeProvider(
  chat: AiChatRow | undefined,
  enabled: boolean,
): ReturnType<typeof useQuery<AiChatRuntimeProvider>> {
  const client = useQueryClient();
  const chatId = chat?.id ?? '';
  const runtime = chat?.engine.kind;
  const codex = useCodexProvider(chatId, enabled && runtime === 'codex');
  const claude = useQuery<AiChatRuntimeProvider>({
    queryKey: nativeRuntimeAdapter('claude').key(chatId),
    enabled: enabled && runtime === 'claude',
    queryFn: async () => {
      const state = await readNativeClaude(chatId);
      return { ...state, ...mergeProviderSnapshot(client, chatId, state) };
    },
  });
  return runtime === 'codex' ? codex : claude;
}

async function readNativeClaude(
  chatId: string,
): Promise<Extract<AiChatRuntimeProvider, { readonly runtime: 'claude' }>> {
  const state = await api().call(E.readAiChatProvider, { params: { chatId } });
  if (!('runtime' in state) || state.runtime !== 'claude')
    throw new Error('Expected an owned Claude runtime provider binding from this hub.');
  return state;
}
export function nativeProviderContext(
  state: AiChatProvider | AiChatRuntimeProvider,
): ProviderExecutionContext | null {
  return 'context' in state ? state.context : null;
}
