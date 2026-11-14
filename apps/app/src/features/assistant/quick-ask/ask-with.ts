import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { NEW_CHAT_ID } from '../chats/draft-thread';
import { NEW_CHAT_DRAFT_KEY } from '../chats/start-chat';
import { setDraft } from '../data/drafts';
import { openQuickAskWith, quickAskHosted } from './quick-ask-host';

export function askAssistantWith(text: string): void {
  if (quickAskHosted()) {
    openQuickAskWith(text);
    return;
  }
  setDraft(NEW_CHAT_DRAFT_KEY, text);
  router.push(href.assistantChat(NEW_CHAT_ID));
}
