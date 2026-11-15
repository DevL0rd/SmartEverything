import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles, startChatWith, useLastChat } from '../../assistant';
import { useDriveLink } from '../../drive';
import { pickedOf } from '../model/ask-actions';
import type { MediaItem } from './info-model';

export interface AskAbout {
  readonly run: () => void;
}

export function askInChat(chatId: string, file: PickedFile): void {
  attachFiles([file], chatId);
  router.push(href.assistantChat(chatId));
}

export function askAbout(chatId: string | null, file: PickedFile): void {
  if (chatId === null) startChatWith([file]);
  else askInChat(chatId, file);
}

export function useAskAbout(item: MediaItem): AskAbout {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  const preview = useDriveLink(item.id, item.rev, 'thumb');
  return {
    run: (): void => {
      const file = pickedOf(item, preview);
      if (file === null) throw new Error(`${item.name} is not a photo or video to ask about`);
      askAbout(chatId, file);
    },
  };
}
