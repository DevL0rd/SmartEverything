import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { useChatHarness } from './harness';
import { useSendingMessage } from './outbox';
import { useChatProvider, useComputerProviderSupported } from '../provider/provider-data';
import { useCodexProvider } from '../provider/codex-provider-data';
import { harnessFeedback, nativeFeedback } from '../model/provider-feedback';
import { turnFeedback, type TurnFeedback } from '../model/turn-feedback';

export function useTurnFeedback(
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
): TurnFeedback | null {
  const owner = useIsOwner();
  const supported = useComputerProviderSupported();
  const session = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  const claude = useChatProvider(chat.id, owner && supported && chat.engine.kind === 'claude');
  const codex = useCodexProvider(chat.id, owner && chat.engine.kind === 'codex');
  const sync = useSyncStatus();
  const sending = useSendingMessage(chat.id);
  const turn = useStoreSelector(
    (state) => Object.values(state.turns).findLast((entry) => entry.chatId === chat.id) ?? null,
  );
  const native = chat.engine.kind === 'codex' ? codex.data : claude.data;
  const supplied = owner ? nativeFeedback(chat, native) : null;
  const provider = chat.engine.kind === 'dsh' ? harnessFeedback(chat, session.data) : supplied;
  return turnFeedback({ rows, turn, sending, online: sync.status === 'live', provider });
}
