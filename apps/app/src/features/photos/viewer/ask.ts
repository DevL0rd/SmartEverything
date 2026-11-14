import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles, useLastChat } from '../../assistant';
import { useDriveLink } from '../../drive';
import { NO_CHAT_HINT, pickedOf } from '../model/ask-actions';
import type { MediaItem } from './info-model';

export interface AskAbout {
  readonly hint: string | null;
  readonly run: () => void;
}

export function askInChat(chatId: string, file: PickedFile): void {
  attachFiles([file], chatId);
  router.push(href.assistantChat(chatId));
}

export function useAskAbout(item: MediaItem): AskAbout {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  const preview = useDriveLink(item.id, item.rev, 'thumb');
  return {
    hint: chatId === null ? NO_CHAT_HINT : null,
    run: (): void => {
      const file = pickedOf(item, preview);
      if (chatId !== null && file !== null) askInChat(chatId, file);
    },
  };
}
