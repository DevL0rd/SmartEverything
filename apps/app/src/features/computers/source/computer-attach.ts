import { background } from '@smarteverything/logging';
import { router } from 'expo-router';
import { FILE_INLINE_LIMIT_BYTES, type FileContent } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { notify } from '../../../components/toast-store';
import { useStableCallback } from '../../../design/use-stable-callback';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles, useLastChat } from '../../assistant';
import type { SourceActionSpec } from '../../files';
import { readFileContent } from './computer-files-data';
import type { ComputerNode, ComputerOrigin } from './computer-node';

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
  const attach = useStableCallback((file: PickedFile): void => {
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
  });
  return { available: chatId !== null, attach };
}

export function attachable(nodes: readonly ComputerNode[]): boolean {
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        node.origin.trashId === null &&
        node.exportable &&
        node.kind !== 'folder' &&
        (node.size ?? 0) <= FILE_INLINE_LIMIT_BYTES,
    )
  );
}

async function attachAll(
  deviceId: string,
  nodes: readonly ComputerNode[],
  attach: (file: PickedFile) => void,
): Promise<void> {
  for (const node of nodes) {
    try {
      attach(pickedFromContent(await readFileContent(deviceId, node.origin.path)));
    } catch (error) {
      notify({ message: `${node.name} wasn’t added to the chat`, error, tone: 'critical' });
    }
  }
}

export function attachAction(
  deviceId: string,
  attach: (file: PickedFile) => void,
): SourceActionSpec<ComputerOrigin> {
  return {
    id: 'attach',
    label: 'Add to chat',
    icon: 'paperclip',
    many: true,
    run: (nodes): void => {
      background(attachAll(deviceId, nodes, attach), 'files.attach_failed');
    },
  };
}
