import { useMemo } from 'react';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import {
  inlineAssistantAttachmentMime,
  type AssistantAttachment,
  type AssistantMessageRow,
  type ImageOperationReceipt,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { base64Of } from '../../../format/base64';
import { compareText } from '../../../format/text';
import { canShareFiles, downloadFile, shareFile } from '../../../platform/file-actions';
import { useRows } from '../../../store/selectors';
import { readableText } from '@smarteverything/domain/markdown';
import { useImageOperations } from '../images/data/image-queries';
import { speakerOf } from '../model/speaker';
import { useAssistantName } from './assistant-data';
import { quoteInto } from './drafts';

const log = new Logger('app.assistant');

export const isImageAttachment = (attachment: AssistantAttachment): boolean =>
  inlineAssistantAttachmentMime(attachment.mime)?.startsWith('image/') === true;

export interface ChatImage {
  readonly attachment: AssistantAttachment;
  readonly chatId: string;
  readonly messageId: string | null;
  readonly sender: string;
  readonly at: string;
  readonly caption: string;
}

interface GalleryEntry {
  readonly at: string;
  readonly images: readonly ChatImage[];
}

function rowEntry(row: AssistantMessageRow, assistantName: string): GalleryEntry {
  const speaker = speakerOf(row, assistantName);
  const sender = speaker.kind === 'me' ? 'You' : speaker.name;
  const caption = readableText(row.text).replace(/\s+/g, ' ').trim();
  return {
    at: row.created_at,
    images: row.attachments.map((attachment) => ({
      attachment,
      chatId: row.chat_id,
      messageId: row.id,
      sender,
      at: row.created_at,
      caption,
    })),
  };
}

function receiptEntry(
  receipt: ImageOperationReceipt,
  loaded: ReadonlySet<string>,
  assistantName: string,
): GalleryEntry {
  return {
    at: receipt.updated_at,
    images: receipt.results
      .map((result) => result.attachment)
      .filter((attachment) => !loaded.has(attachment.id))
      .map((attachment) => ({
        attachment,
        chatId: receipt.chat_id,
        messageId: receipt.result_message_id ?? null,
        sender: assistantName,
        at: receipt.updated_at,
        caption: '',
      })),
  };
}

export function galleryImagesOf(
  rows: readonly AssistantMessageRow[],
  receipts: readonly ImageOperationReceipt[],
  chatId: string,
  assistantName: string,
): readonly ChatImage[] {
  const inChat = rows.filter((row) => row.chat_id === chatId);
  const loaded = new Set(inChat.flatMap((row) => row.attachments.map((image) => image.id)));
  const entries = [
    ...inChat.map((row) => rowEntry(row, assistantName)),
    ...receipts
      .filter((receipt) => receipt.chat_id === chatId && receipt.message_deleted !== true)
      .map((receipt) => receiptEntry(receipt, loaded, assistantName)),
  ];
  const seen = new Set<string>();
  return entries
    .sort((left, right) => compareText(left.at, right.at))
    .flatMap((entry) => entry.images)
    .filter(({ attachment }) => {
      if (!isImageAttachment(attachment) || seen.has(attachment.id)) return false;
      seen.add(attachment.id);
      return true;
    });
}

export function useChatImages(
  attachmentId: string,
  explicitChatId: string | null = null,
): readonly ChatImage[] {
  const rows = useRows('assistant_messages');
  const assistantName = useAssistantName();
  const chatId =
    rows.find((row) => row.attachments.some((file) => file.id === attachmentId))?.chat_id ??
    explicitChatId;
  const operations = useImageOperations(chatId);
  return useMemo(
    () =>
      chatId === null ? [] : galleryImagesOf(rows, operations.data ?? [], chatId, assistantName),
    [rows, operations.data, chatId, assistantName],
  );
}

async function copiedImage(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`The image could not be read (HTTP ${String(response.status)})`);
  const buffer = await response.arrayBuffer();
  await Clipboard.setImageAsync(base64Of(buffer, 0, buffer.byteLength));
}

export function copyChatImage(url: string, name: string): void {
  const operation = log.operation('image.copy', { nameLength: name.length });
  copiedImage(url).then(
    () => {
      operation.succeeded();
      notify({ message: 'Image copied' });
    },
    (error: unknown) => {
      operation.failed(error);
      notify({ message: 'The image was not copied', error, tone: 'critical' });
    },
  );
}

export function quoteChatImage(image: ChatImage, messageId: string): void {
  quoteInto(image.chatId, {
    messageId,
    who: image.sender,
    text: image.caption === '' ? image.attachment.name : image.caption,
  });
}

export function openImageMessage(image: ChatImage, messageId: string): void {
  router.navigate(href.assistantChat(image.chatId, { message: messageId }));
}

function fileItem(
  label: string,
  icon: MenuItem['icon'],
  url: string | undefined,
  run: (url: string) => void,
): MenuItem {
  return {
    label,
    ...(icon === undefined ? {} : { icon }),
    disabled: url === undefined,
    onPress: (): void => {
      if (url !== undefined) run(url);
    },
  };
}

export function imageActionsOf(
  image: ChatImage,
  url: string | undefined,
  leave: () => void,
): readonly MenuItem[] {
  const { name } = image.attachment;
  const { messageId } = image;
  const files = [
    fileItem('Save', 'download', url, (link) => {
      downloadFile(link, name);
    }),
    ...(canShareFiles()
      ? [
          fileItem('Share', 'share', url, (link) => {
            shareFile(link, name);
          }),
        ]
      : []),
    fileItem('Copy image', 'copy', url, (link) => {
      copyChatImage(link, name);
    }),
  ];
  if (messageId === null) return files;
  const after = (run: (image: ChatImage, messageId: string) => void) => (): void => {
    leave();
    run(image, messageId);
  };
  return [
    ...files,
    { label: 'Quote', icon: 'reply', onPress: after(quoteChatImage) },
    { label: 'Open in message', icon: 'messageCircle', onPress: after(openImageMessage) },
  ];
}
