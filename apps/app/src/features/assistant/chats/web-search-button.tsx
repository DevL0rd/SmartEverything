import type { ReactNode } from 'react';
import { chatSearchesWeb, type AiChatRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { useAssistantStatus } from '../data/assistant-data';
import { changeChat } from './chat-actions';

export function useChatSearchesWeb(chat: AiChatRow): boolean {
  const byDefault = useAssistantStatus()?.settings.web_search_default === true;
  return chatSearchesWeb(chat, byDefault);
}

export function WebSearchButton({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const on = useChatSearchesWeb(chat);
  return (
    <IconButton
      icon="globe"
      label={on ? 'Web search on' : 'Web search off'}
      selected={on}
      onPress={() => {
        void changeChat(chat.id, { web_search: !on });
      }}
    />
  );
}
