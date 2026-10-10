import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
import { sendMessage } from '../data/send';

const log = new Logger('app.assistant');

const REPLY_CATEGORY = 'assistant_reply';

const REPLY_ACTION = 'reply';

const REPLY_TAP = z.object({
  kind: z.literal('assistant_reply'),
  messageId: z.uuid(),
  chatId: z.uuid().optional(),
});

function registerCategory(): void {
  Notifications.setNotificationCategoryAsync(REPLY_CATEGORY, [
    {
      identifier: REPLY_ACTION,
      buttonTitle: 'Reply',
      textInput: { submitButtonTitle: 'Send', placeholder: 'Reply' },
      options: { opensAppToForeground: true },
    },
  ]).catch((error: unknown) => {
    log.warn('push.category_failed', { reason: String(error) });
  });
}

function chatHref(store: EntityStore, tap: z.infer<typeof REPLY_TAP>): Href {
  if (tap.chatId !== undefined) {
    return href.assistantChat(tap.chatId);
  }
  const { messageId } = tap;
  const message = store.get().tables.assistant_messages.byId[messageId];
  if (message === undefined) {
    log.warn('push.message_unknown', { messageId });
    return href.assistantChat();
  }
  return href.assistantChat(message.chat_id);
}

function handle(response: Notifications.NotificationResponse, store: EntityStore): void {
  const tap = REPLY_TAP.safeParse(response.notification.request.content.data);
  if (!tap.success) {
    return;
  }
  const text = response.userText?.trim() ?? '';
  if (response.actionIdentifier === REPLY_ACTION && text !== '') {
    log.info('push.inline_reply', {});
    void sendMessage(text, []);
  }
  router.navigate(chatHref(store, tap.data));
}

export function AssistantPushHost(): ReactNode {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const store = useEntityStore();
  useEffect(registerCategory, []);
  useEffect(() => {
    if (response === null || response === undefined) {
      return;
    }
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current === key) {
      return;
    }
    handled.current = key;
    handle(response, store);
  }, [response, store]);
  return null;
}
