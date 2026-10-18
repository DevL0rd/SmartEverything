import { useEffect, useEffectEvent, useRef } from 'react';
import { useNavigation } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { openInstantly } from '../../../app-shell/instant-open';
import { useAiLayoutFor } from '../shell/use-ai-layout';
import { useLatestChatId } from '../data/chat-store';
import { forgetGoneChat, useLastChat } from '../data/last-chat';
import { localPref, setLocalPref } from '../../../store/local-prefs';
import { chatWasRecent, phoneEntryOf } from './phone-entry';

const log = new Logger('app.assistant');

const CHAT_ROUTE = 'assistant/chat/[chatId]';

export function noteChatSeen(): void {
  setLocalPref('chatSeenAt', Date.now());
}

export function useOpenLastChat(wide: boolean, paused: boolean): void {
  const navigation = useNavigation();
  const last = useLastChat();
  const latest = useLatestChatId();
  const waiting = useRef(false);
  const enter = useEffectEvent((): void => {
    waiting.current = false;
    if (paused || !navigation.isFocused()) {
      return;
    }
    const target = phoneEntryOf(
      last,
      wide ? latest : null,
      wide || chatWasRecent(localPref('chatSeenAt'), Date.now()),
    );
    if (target.kind === 'wait') {
      waiting.current = true;
      return;
    }
    if (target.forget && last.kind === 'gone') {
      forgetGoneChat(last);
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
  }, [wide]);
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

export function usePrewarmChat(): () => string | null {
  const wide = useAiLayoutFor(false).mode !== 'stack';
  const last = useLastChat();
  const latest = useLatestChatId();
  return (): string | null => {
    const target = phoneEntryOf(
      last,
      wide ? latest : null,
      wide || chatWasRecent(localPref('chatSeenAt'), Date.now()),
    );
    return target.kind === 'chat' ? target.chatId : null;
  };
}
