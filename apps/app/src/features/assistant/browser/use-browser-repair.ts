import { useEffect, useEffectEvent } from 'react';
import { randomUUID } from 'expo-crypto';
import { Logger, background } from '@smarteverything/logging';
import { ApiError, type AiChatRow, type BrowserConsoleMessage } from '@smarteverything/domain';
import { sendAiChatMessage } from '../../../api/ai';
import { InvalidRequestError } from '../../../api/connection/client';
import { useForeground } from '../../../design/animation-gate';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { notify } from '../../../components/toast-store';
import { useChatMessages } from '../data/chat-store';
import { isComputerEngine } from '../provider/computer-engine';
import { browserConsole } from './browser-console-store';
import { repairPrompt, type BrowserRepair } from './browser-repair';

const log = new Logger('app.browser-repair');

export function useBrowserRepair(
  chat: AiChatRow,
  targetId: string,
  visible: boolean,
  repair: BrowserRepair,
): void {
  const rows = useChatMessages(chat.id);
  const foreground = useForeground();
  const owner = useIsOwner();
  const sync = useSyncStatus();
  const allowed =
    visible && foreground && sync.status === 'live' && (!isComputerEngine(chat.engine) || owner);
  useEffect(() => {
    repair.observe(rows);
  }, [repair, rows]);
  const wake = useEffectEvent(
    (error: BrowserConsoleMessage, history: readonly BrowserConsoleMessage[]): void => {
      if (!allowed || !repair.idle() || !browserConsole.claim(error)) return;
      background(sendRepair(chat.id, repair, error, history), 'browser.repair_wake_failed');
    },
  );
  useEffect(
    () => (allowed ? browserConsole.listen(targetId, wake) : undefined),
    [allowed, targetId],
  );
}

async function sendRepair(
  chatId: string,
  repair: BrowserRepair,
  error: BrowserConsoleMessage,
  history: readonly BrowserConsoleMessage[],
): Promise<void> {
  const clientMessageId = randomUUID();
  repair.start(clientMessageId);
  try {
    const row = await sendAiChatMessage(chatId, repairPrompt(error, history), [], {
      clientMessageId,
    });
    repair.observe([row]);
  } catch (cause) {
    if (cause instanceof InvalidRequestError || (cause instanceof ApiError && cause.status < 500))
      repair.rejected(clientMessageId);
    log.warn('browser.repair_not_confirmed', { chatId, clientMessageId });
    notify({
      message: 'Could not confirm delivery of the browser error to the AI.',
      tone: 'critical',
    });
  }
}
