import { readFile } from 'node:fs/promises';
import {
  ApiError,
  type ProviderContent,
  type AiChatRow,
  type ProviderTurn,
} from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { AssistantFiles } from '../../files';
import { z } from 'zod';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { mediaKindOf } from '../../../transcripts/media-notes';
import { attachmentNote } from '../../attachment-note';

const IMAGE_MIME = z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TEXT_BYTES_MAX = 150_000;
const HISTORY_MAX = 500;
const IN_HISTORY = new Set<StoredEvent['kind']>(['chat', 'report', 'plugin']);

export async function providerMessages(
  resources: {
    readonly store: Store;
    readonly files: AssistantFiles;
    readonly runtime?: 'claude' | 'codex';
  },
  chat: AiChatRow,
  event: StoredEvent,
  resumed: boolean,
): Promise<ProviderTurn['messages']> {
  const { store, files } = resources;
  const runtime = resources.runtime ?? 'claude';
  const rows = resumed
    ? event.message_id === null
      ? []
      : [store.assistantChat.message(event.message_id)]
    : store.assistantChat.since(chat.id, null);
  const messages: ProviderTurn['messages'] = [];
  for (const row of rows.filter(inProviderHistory))
    messages.push(
      await messageContent({ store, files }, row, {
        runtime,
        current: row.id === event.message_id,
      }),
    );
  if (!IN_HISTORY.has(event.kind) || messages.length === 0)
    messages.push({ role: 'user', content: [{ type: 'text', text: event.text }] });
  if (messages.length > HISTORY_MAX)
    throw new ApiError(
      'conflict',
      'This fresh provider session exceeds the bounded history limit; choose a branch or a new chat.',
    );
  return messages;
}

async function attachmentContent(
  files: AssistantFiles,
  runtime: 'claude' | 'codex',
  file: ReturnType<Store['assistantChat']['attachment']>,
  current: boolean,
): Promise<ProviderContent> {
  if (cachedMedia(file.mime, current))
    return {
      type: 'text',
      text: `${attachmentNote(file, await files.ensureMediaNote(file))}\nOriginal attachment: ${file.id}; use read_assistant_attachment for explicit inspection.`,
    };
  const bytes = await readFile(files.pathOf(file));
  const mime = IMAGE_MIME.safeParse(file.mime);
  if (mime.success) return { type: 'image', media_type: mime.data, data: bytes.toString('base64') };
  if (file.mime === 'application/pdf' && runtime === 'claude')
    return { type: 'document', media_type: 'application/pdf', data: bytes.toString('base64') };
  if (file.mime.startsWith('text/') || file.mime === 'application/json') {
    if (bytes.length > TEXT_BYTES_MAX)
      throw new ApiError(
        'invalid_request',
        `The text attachment ${file.name} exceeds the provider text input limit.`,
      );
    return {
      type: 'text',
      text: `[Attached file: ${file.name}]\n${new TextDecoder('utf-8', { fatal: true }).decode(bytes)}`,
    };
  }
  if (file.transcript !== null)
    return { type: 'text', text: `[Transcript of ${file.name}]\n${file.transcript}` };
  throw new ApiError(
    'invalid_request',
    `The selected provider cannot accept ${file.mime} directly. Convert ${file.name} to a supported image, PDF or text input.`,
  );
}

function inProviderHistory(row: AssistantMessageRow): boolean {
  return (
    !(row.role === 'responder' && row.state === 'working') &&
    (row.text !== '' || row.attachments.length > 0)
  );
}
async function messageContent(
  resources: { readonly store: Store; readonly files: AssistantFiles },
  row: AssistantMessageRow,
  options: { readonly runtime: 'claude' | 'codex'; readonly current: boolean },
): Promise<ProviderTurn['messages'][number]> {
  const { store, files } = resources;
  const { runtime, current } = options;
  const content: ProviderTurn['messages'][number]['content'] = [];
  if (row.text !== '') content.push({ type: 'text', text: row.text });
  for (const file of store.assistantChat.attachmentsOf(row.id))
    content.push(await attachmentContent(files, runtime, file, current));
  return { role: row.role === 'responder' ? 'assistant' : 'user', content };
}

function cachedMedia(mime: string, current: boolean): boolean {
  return mediaKindOf(mime) !== null && (!current || !IMAGE_MIME.safeParse(mime).success);
}
