import { router } from 'expo-router';
import type { FileContent } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles, useLastChat } from '../../assistant';

export const NO_CHAT_REASON = 'Open a chat first, then come back to add this to it.';

export function pickedFromBase64(
  name: string,
  mime: string,
  base64: string,
  preview: string | null,
): PickedFile {
  const binary = atob(base64);
  const view = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) view[index] = binary.charCodeAt(index);
  return { name, mime, bytes: view.byteLength, preview, data: () => Promise.resolve(view.buffer) };
}

export function pickedFromContent(content: FileContent): PickedFile {
  if (content.encoding === 'base64') {
    const preview = content.mimeType.startsWith('image/')
      ? `data:${content.mimeType};base64,${content.content}`
      : null;
    return pickedFromBase64(content.name, content.mimeType, content.content, preview);
  }
  const encoded = new TextEncoder().encode(content.content);
  return {
    name: content.name,
    mime: content.mimeType,
    bytes: encoded.byteLength,
    preview: null,
    data: () => Promise.resolve(encoded.slice().buffer),
  };
}

export interface ChatAttach {
  readonly available: boolean;
  readonly attach: (file: PickedFile) => void;
}

export function useChatAttach(): ChatAttach {
  const last = useLastChat();
  const chatId = last.kind === 'open' ? last.chatId : null;
  return {
    available: chatId !== null,
    attach: (file: PickedFile): void => {
      if (chatId === null) return;
      attachFiles([file], chatId);
      notify({
        message: `${file.name} added to the message field`,
        tone: 'positive',
        action: {
          label: 'Open chat',
          onPress: () => {
            router.push(href.assistantChat(chatId));
          },
        },
      });
    },
  };
}
