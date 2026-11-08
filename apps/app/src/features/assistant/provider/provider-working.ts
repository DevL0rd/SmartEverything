import { useChatHarness } from '../data/harness';
import type { AiChatRow, AiHarnessSession } from '@smarteverything/domain';
import { useIsOwner } from '../../../store/selectors';
import { useChatWorking } from '../data/chat-store';
import { useChatProvider } from './provider-data';
import { useCodexProvider } from './codex-provider-data';
const CODEX_ACTIVE: ReadonlySet<string> = new Set([
  'starting',
  'working',
  'waiting_approval',
  'waiting_answer',
  'stopping',
  'unknown',
]);
export function useProviderWorking(chat: AiChatRow): boolean {
  const owner = useIsOwner();
  const harness = useChatHarness(chat.id, harnessBound(chat));
  const working = useChatWorking(chat.id);
  const claude = useChatProvider(chat.id, nativeEnabled(chat, owner, 'claude'));
  const codex = useCodexProvider(chat.id, nativeEnabled(chat, owner, 'codex'));
  switch (chat.engine.kind) {
    case 'dsh':
      return working || harnessWorking(harness.data);
    case 'claude':
      return working || claude.data?.state === 'working';
    case 'codex':
      return working || codexWorking(codex.data?.state);
  }
}

function harnessWorking(session: AiHarnessSession | undefined): boolean {
  return session !== undefined && ['working', 'waiting', 'switching'].includes(session.state);
}

function nativeEnabled(chat: AiChatRow, enabled: boolean, runtime: 'claude' | 'codex'): boolean {
  return enabled && chat.engine.kind === runtime;
}
function codexWorking(state: string | undefined): boolean {
  return state !== undefined && CODEX_ACTIVE.has(state);
}

function harnessBound(chat: AiChatRow): boolean {
  return chat.engine.kind === 'dsh' && chat.engine.session_id !== null;
}
