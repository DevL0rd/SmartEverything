import type { ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import { DecisionFrame } from '../../../components/decision-frame';
import { useActiveProfile } from '../../../store/people';
import { useDevice, useIsOwner, useSyncStatus } from '../../../store/selectors';
import { Text } from '../../../components/text';
import { NATIVE_OWNER_REASON } from './provider-access';
import { HarnessPromptDock } from './harness-interactions';
import { useCodexProvider } from './codex-provider-data';
import { CodexProviderPrompt } from './codex-provider-prompts';
import { useChatProvider } from './provider-data';
import { ProviderPrompt } from './provider-prompts';
function ClaudePromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const owner = useIsOwner();
  const profile = useActiveProfile();
  const sync = useSyncStatus();
  const provider = useChatProvider(chat.id, owner && chat.engine.kind === 'claude');
  const device = useDevice(chat.engine.kind === 'claude' ? chat.engine.device_id : '');
  const pending = provider.data?.prompts.filter((prompt) => prompt.status === 'pending') ?? [];
  if (!owner)
    return (
      <Text tone="variant" className="px-gutter py-2">
        {NATIVE_OWNER_REASON}
      </Text>
    );
  const unavailable = nativeUnavailable({
    chat,
    profileId: profile?.id ?? null,
    live: sync.status === 'live',
    error: provider.error,
    state: provider.data,
  });
  return (
    <DecisionFrame
      source={providerSource('Claude', device?.label)}
      unavailable={unavailable}
      retry={() => {
        void provider.refetch();
      }}
      requests={pending.map((prompt) => ({
        id: nativeRequestId(profile?.id ?? 'none', chat.id, provider.data, JSON.stringify(prompt)),
        content: (
          <ProviderPrompt chatId={chat.id} prompt={prompt} disabled={unavailable !== null} />
        ),
      }))}
    />
  );
}
function CodexPromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const owner = useIsOwner();
  const profile = useActiveProfile();
  const sync = useSyncStatus();
  const provider = useCodexProvider(chat.id, owner);
  const device = useDevice(chat.engine.kind === 'codex' ? chat.engine.device_id : '');
  const pending = provider.data?.prompts.filter((prompt) => prompt.status === 'pending') ?? [];
  if (!owner)
    return (
      <Text tone="variant" className="px-gutter py-2">
        {NATIVE_OWNER_REASON}
      </Text>
    );
  const unavailable = nativeUnavailable({
    chat,
    profileId: profile?.id ?? null,
    live: sync.status === 'live',
    error: provider.error,
    state: provider.data,
  });
  return (
    <DecisionFrame
      source={providerSource('Codex', device?.label)}
      unavailable={unavailable}
      retry={() => {
        void provider.refetch();
      }}
      requests={pending.map((prompt) => ({
        id: nativeRequestId(profile?.id ?? 'none', chat.id, provider.data, JSON.stringify(prompt)),
        content: (
          <CodexProviderPrompt chatId={chat.id} prompt={prompt} disabled={unavailable !== null} />
        ),
      }))}
    />
  );
}
export function ProviderPromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  if (chat.engine.kind === 'dsh')
    return <HarnessPromptDock key={JSON.stringify(chat.engine)} chat={chat} />;
  if (chat.engine.kind === 'codex')
    return <CodexPromptDock key={JSON.stringify(chat.engine)} chat={chat} />;
  if (chat.engine.kind === 'claude')
    return <ClaudePromptDock key={JSON.stringify(chat.engine)} chat={chat} />;
  return null;
}

function providerSource(name: string, device: string | undefined): string {
  return `${name} · ${device ?? 'Computer unavailable'}`;
}
function nativeUnavailable({
  chat,
  profileId,
  live,
  error,
  state,
}: {
  readonly chat: AiChatRow;
  readonly profileId: string | null;
  readonly live: boolean;
  readonly error: Error | null;
  readonly state: NativeBinding | undefined;
}): string | null {
  if (!live) return 'Reconnect to answer this request.';
  if (profileId !== chat.profile_id) return 'Switch to this conversation’s profile to answer.';
  if (error !== null) return error.message;
  if (state === undefined) return null;
  if (
    (chat.engine.kind === 'claude' || chat.engine.kind === 'codex') &&
    chat.engine.device_id !== state.device_id
  )
    return 'This request belongs to the previous computer. Refresh requests to continue.';
  return null;
}

interface NativeBinding {
  readonly device_id: string;
  readonly session_id: string | null;
  readonly job_id: string | null;
}
function nativeRequestId(
  profileId: string,
  chatId: string,
  state: NativeBinding | undefined,
  request: string,
): string {
  if (state === undefined)
    throw new Error('Pending native request requires its supplying session.');
  return `${profileId}:${chatId}:${state.device_id}:${state.session_id ?? 'none'}:${state.job_id ?? 'none'}:${request}`;
}
