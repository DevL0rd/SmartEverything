import { useEffect, useEffectEvent, useRef } from 'react';
import { useNavigation } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { openInstantly } from '../../../app-shell/instant-open';
import { useLatestChatId } from '../data/chat-store';
import { forgetGoneChat, useLastChat, type LastChat } from '../data/last-chat';

const log = new Logger('app.assistant');

const CHAT_ROUTE = 'assistant/chat/[chatId]';

type GoneChat = Extract<LastChat, { kind: 'gone' }>;

type Target =
  | { readonly kind: 'wait' }
  | { readonly kind: 'chat'; readonly chatId: string | null; readonly forget: GoneChat | null };

function targetOf(last: LastChat, newest: string | null): Target {
  switch (last.kind) {
    case 'pending':
      return { kind: 'wait' };
    case 'gone':
      return { kind: 'chat', chatId: newest, forget: last };
    case 'open':
      return { kind: 'chat', chatId: last.chatId, forget: null };
    case 'none':
      return { kind: 'chat', chatId: newest, forget: null };
  }
}

export function useOpenLastChat(split: boolean, paused: boolean): void {
  const navigation = useNavigation();
  const last = useLastChat();
  const latest = useLatestChatId();
  const waiting = useRef(false);
  const enter = useEffectEvent((): void => {
    waiting.current = false;
    if (paused || !navigation.isFocused()) {
      return;
    }
    const target = targetOf(last, split ? latest : null);
    if (target.kind === 'wait') {
      waiting.current = true;
      return;
    }
    if (target.forget !== null) {
      forgetGoneChat(target.forget);
    }
    if (target.chatId !== null) {
      openInstantly(href.assistantChat(target.chatId), {
        name: CHAT_ROUTE,
        params: { chatId: target.chatId },
      });
    }
  });
  useEffect(() => {
    enter();
  }, [split]);
  useEffect(() => {
    if (waiting.current && last.kind !== 'pending') {
      enter();
    }
  }, [last.kind]);
  useEffect(() => {
    const tab = navigation.getParent();
    if (tab === undefined) {
      log.warn('open_last_chat.no_tab', {});
      return undefined;
    }
    return tab.addListener('focus', () => {
      enter();
    });
  }, [navigation]);
}
