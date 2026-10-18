import { useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { notify } from '../../../components/toast-store';

const log = new Logger('app.quick-ask');

interface SentMessage {
  readonly chatId: string;
  readonly title: string | null;
  readonly queued: boolean;
}

export type Delivered = (message: SentMessage) => void;

export interface QuickAskDelivery {
  readonly begin: () => Delivered;
}

function openChat(chatId: string): void {
  router.navigate(href.assistantChat(chatId));
}

function messageOf(sent: SentMessage): { readonly message: string; readonly detail?: string } {
  if (sent.title === null) return { message: 'Sent to a new chat' };
  if (!sent.queued) return { message: `Sent to “${sent.title}”` };
  return {
    message: 'Waiting for connection',
    detail: `Sends to “${sent.title}” when your hub is back`,
  };
}

function announce(sent: SentMessage): void {
  notify({
    ...messageOf(sent),
    action: {
      label: 'Open',
      onPress: (): void => {
        openChat(sent.chatId);
      },
    },
  });
}

export function useQuickAskDelivery(): QuickAskDelivery {
  const opening = useRef(false);
  const track = useCallback((press: KeyPress): boolean => {
    opening.current = press.key === 'Enter' && press.command;
    return false;
  }, []);
  useKeyboard(track, true);
  return {
    begin: (): Delivered => {
      const open = opening.current;
      opening.current = false;
      return (message): void => {
        log.info('quick_ask.delivered', {
          chatId: message.chatId,
          queued: message.queued,
          openedNow: open,
          newChat: message.title === null,
        });
        if (open) openChat(message.chatId);
        else announce(message);
      };
    },
  };
}
