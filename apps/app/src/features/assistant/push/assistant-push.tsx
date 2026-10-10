import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { sendMessage } from '../data/send';

const log = new Logger('app.assistant');

const REPLY_CATEGORY = 'assistant_reply';

const REPLY_ACTION = 'reply';

const REPLY_TAP = z.object({ kind: z.literal('assistant_reply'), messageId: z.uuid() });

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

function handle(response: Notifications.NotificationResponse): void {
  if (!REPLY_TAP.safeParse(response.notification.request.content.data).success) {
    return;
  }
  const text = response.userText?.trim() ?? '';
  if (response.actionIdentifier === REPLY_ACTION && text !== '') {
    log.info('push.inline_reply', {});
    void sendMessage(text, []);
  }
  router.navigate(href.assistantChat());
}

export function AssistantPushHost(): ReactNode {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
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
    handle(response);
  }, [response]);
  return null;
}
