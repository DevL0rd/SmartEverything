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
import { background } from '@smarteverything/logging';
interface NativeProviderQuery<Prompt> {
  readonly data: (NativeBinding & { readonly prompts: readonly Prompt[] }) | undefined;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}
function NativePromptDock<Prompt extends { readonly status: string }>({
  chat,
  name,
  provider,
  render,
}: {
  readonly chat: AiChatRow;
  readonly name: string;
  readonly provider: NativeProviderQuery<Prompt>;
  readonly render: (prompt: Prompt, disabled: boolean) => ReactNode;
}): ReactNode {
  const owner = useIsOwner();
  const profile = useActiveProfile();
  const sync = useSyncStatus();
  const device = useDevice(
    chat.engine.kind === 'claude' || chat.engine.kind === 'codex' ? chat.engine.device_id : '',
  );
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
      source={providerSource(name, device?.label)}
      unavailable={unavailable}
      retry={() => {
        background(provider.refetch(), 'provider.refetch_failed');
      }}
      requests={pending.map((prompt) => ({
        id: nativeRequestId(profile?.id ?? 'none', chat.id, provider.data, JSON.stringify(prompt)),
        content: render(prompt, unavailable !== null),
      }))}
    />
  );
}
function ClaudePromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const provider = useChatProvider(chat.id, useIsOwner() && chat.engine.kind === 'claude');
  return (
    <NativePromptDock
      chat={chat}
      name="Claude"
      provider={provider}
      render={(prompt, disabled) => (
        <ProviderPrompt chatId={chat.id} prompt={prompt} disabled={disabled} />
      )}
    />
  );
}
function CodexPromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const provider = useCodexProvider(chat.id, useIsOwner());
  return (
    <NativePromptDock
      chat={chat}
      name="Codex"
      provider={provider}
      render={(prompt, disabled) => (
        <CodexProviderPrompt chatId={chat.id} prompt={prompt} disabled={disabled} />
      )}
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
  if (state === undefined) throw new Error('This request has closed.');
  return `${profileId}:${chatId}:${state.device_id}:${state.session_id ?? 'none'}:${state.job_id ?? 'none'}:${request}`;
}
