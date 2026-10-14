import type { AiChatRow } from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { api } from '../../../api/transport';
import { useActiveProfile } from '../../../store/people';
import { useSyncStatus } from '../../../store/selectors';
import { useDshCommandBinding } from './dsh-binding';
import { useNativeCommandBinding } from './native-binding';
import type { CommandBinding } from './types';
export type { CommandBinding } from './types';
const connections = new WeakMap<ReturnType<typeof api>, string>();
function connectionId(live: boolean): string {
  if (!live) return 'offline';
  const client = api();
  const existing = connections.get(client);
  if (existing !== undefined) return existing;
  const id = randomUUID();
  connections.set(client, id);
  return id;
}
export function useCommandBinding(chat: AiChatRow | undefined, opened: boolean): CommandBinding {
  const profile = useActiveProfile();
  const live = useSyncStatus().status === 'live';
  const dsh = useDshCommandBinding(chat, opened);
  const native = useNativeCommandBinding(chat);
  if (chat?.engine.kind === 'dsh' || chat?.engine.kind === 'openrouter') return harnessBinding(dsh);
  const key = JSON.stringify([connectionId(live), profile?.id, chat?.id, native.key]);
  return otherBinding(chat, native, key, live);
}
function harnessBinding(dsh: ReturnType<typeof useDshCommandBinding>): CommandBinding {
  return {
    ...dsh,
    discoveryKey: dsh.key,
    target: dsh.scope === null ? null : { kind: 'dsh', scope: dsh.scope },
  };
}
function otherBinding(
  chat: AiChatRow | undefined,
  native: CommandBinding,
  key: string,
  live: boolean,
): CommandBinding {
  if (chat?.engine.kind === 'codex' || chat?.engine.kind === 'claude')
    return {
      ...native,
      key,
      reason: live ? native.reason : 'Reconnect to see commands for this chat.',
    };
  return {
    key,
    discoveryKey: key,
    chatId: chat?.id ?? null,
    target: null,
    reason: 'Finding commands…',
    retry: (): void => undefined,
  };
}
