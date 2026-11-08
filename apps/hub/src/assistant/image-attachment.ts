import { IMAGE_MIME } from '@smarteverything/domain';
import { StoreNotFoundError } from '../store/context';
import type {
  AssistantChatRepository,
  StoredAttachment,
} from '../store/repositories/assistant-chat';

export function imageAttachmentOf(
  chat: Pick<AssistantChatRepository, 'attachment'>,
  id: string,
): StoredAttachment | undefined {
  let file: StoredAttachment;
  try {
    file = chat.attachment(id);
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) return undefined;
    throw cause;
  }
  return IMAGE_MIME.safeParse(file.mime).success ? file : undefined;
}

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;

export interface SniffedImage {
  readonly mime: keyof typeof EXTENSIONS;
  readonly extension: (typeof EXTENSIONS)[keyof typeof EXTENSIONS];
}

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  return signature.every((byte, index) => bytes[at + index] === byte);
}

export function sniffImage(bytes: Uint8Array): SniffedImage | undefined {
  const mime = sniffedMime(bytes);
  return mime === undefined ? undefined : { mime, extension: EXTENSIONS[mime] };
}

function sniffedMime(bytes: Uint8Array): SniffedImage['mime'] | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp';
  return undefined;
}
