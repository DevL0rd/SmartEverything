import { readFile } from 'node:fs/promises';
import {
  isHelperDialogueMessage,
  CODEX_PROVIDER_IMAGE_MAX_BYTES,
  PROVIDER_CONTENT,
  PROVIDER_IMAGE_MIME,
  PROVIDER_MESSAGE_PARTS_MAX,
  PROVIDER_TURN_MAX_BYTES,
  PROVIDER_TEXT_MAX,
  ApiError,
  type ProviderContent,
  type AiChatRow,
  type ProviderTurn,
} from '@smarteverything/domain';
import type { StoredAttachment } from '../../../store/repositories/assistant-chat';
import type { Store } from '../../../store/store';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { AssistantFiles } from '../../files';
import type { AssistantMessageRow } from '@smarteverything/domain';
import type { ComputerEngine } from '../../engine-kind';
import type { HelperProviderInput } from '../engine';
import { mediaKindOf } from '../../../transcripts/media-notes';
import { isHelperDialogueMirror } from '../../delegation/relay-speaker';

const HELPER_QUOTE_PREFIX = 'Earlier reply you were asked about:\n';
const TEXT_BYTES_MAX = 150_000;
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
  const rows = providerHistory(store, chat, event.message_id, resumed);
  const messages: ProviderTurn['messages'] = [];
  for (const row of rows.filter(inProviderHistory))
    messages.push(
      await messageContent({ store, files }, row, {
        runtime,
        current: row.id === event.message_id,
        quote: row.id === event.message_id ? (event.helper_quote_text ?? null) : null,
      }),
    );
  if (!IN_HISTORY.has(event.kind) || messages.length === 0)
    messages.push({ role: 'user', content: [{ type: 'text', text: event.text }] });
  return messages;
}

function providerHistory(
  store: Store,
  chat: AiChatRow,
  messageId: string | null,
  resumed: boolean,
): AssistantMessageRow[] {
  if (resumed) return messageId === null ? [] : [store.assistantChat.message(messageId)];
  return messageId === null
    ? store.assistantChat.since(chat.id, null)
    : causalProviderHistory(store.assistantChat.since(chat.id, null), messageId);
}

function causalProviderHistory(
  rows: readonly AssistantMessageRow[],
  id: string,
): AssistantMessageRow[] {
  const position = rows.findIndex((row) => row.id === id);
  const current = rows[position];
  if (current === undefined) return [];
  const earlier = new Set(rows.slice(0, position).map((row) => row.id));
  return [...rows.filter((row) => providerPredecessor(row, id, earlier)), current];
}

function providerPredecessor(
  row: AssistantMessageRow,
  current: string,
  earlier: ReadonlySet<string>,
): boolean {
  if (row.id === current) return false;
  if (row.role === 'person') return earlier.has(row.id);
  return row.reply_to === null || earlier.has(row.reply_to);
}

async function attachmentContent(
  files: AssistantFiles,
  file: StoredAttachment,
  options: {
    readonly runtime: 'claude' | 'codex';
    readonly current: boolean;
    readonly verify: boolean;
  },
): Promise<ProviderContent> {
  const { current, runtime, verify } = options;
  const checked = verify ? await files.bytesOf(file) : null;
  if (cachedMedia(file.mime, current)) return { type: 'text', text: files.noteLine(file) };
  const bytes = checked ?? (await readFile(files.pathOf(file)));
  return bytesContent(runtime, file, bytes);
}

function bytesContent(
  runtime: ComputerEngine['kind'],
  file: StoredAttachment,
  bytes: Buffer,
): ProviderContent {
  const mime = PROVIDER_IMAGE_MIME.safeParse(file.mime);
  if (mime.success) {
    if (runtime === 'codex' && bytes.length > CODEX_PROVIDER_IMAGE_MAX_BYTES)
      throw new ApiError(
        'invalid_request',
        `The image ${file.name} exceeds Codex’s image input limit.`,
      );
    return { type: 'image', media_type: mime.data, data: bytes.toString('base64') };
  }
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
      text: `[Attached file: ${file.name}]\n${decodeText(file.name, bytes)}`,
    };
  }
  if (file.transcript !== null)
    return { type: 'text', text: `[Transcript of ${file.name}]\n${file.transcript}` };
  throw new ApiError(
    'invalid_request',
    `The selected provider cannot accept ${file.mime} directly. Convert ${file.name} to a supported image, PDF or text input.`,
  );
}

function decodeText(name: string, bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    throw new ApiError('invalid_request', `Save ${name} as UTF-8 text before attaching it.`);
  }
}

export function appendsProviderContext(runtime: ComputerEngine['kind'], text: string): boolean {
  return runtime === 'codex' || !text.startsWith('/');
}

export async function helperProviderMessage(
  resources: { readonly store: Store; readonly files: AssistantFiles },
  input: HelperProviderInput,
  engine: ComputerEngine,
): Promise<ProviderTurn['messages'][number]> {
  const parts = textParts(input.text, input.quote);
  const reserved = Number(appendsProviderContext(engine.kind, input.text));
  if (parts.length + input.files.length + reserved > PROVIDER_MESSAGE_PARTS_MAX)
    throw inputTooLarge();
  let bytes = Buffer.byteLength(JSON.stringify(parts), 'utf8');
  for (const file of input.files) {
    const part = await attachmentContent(resources.files, file, {
      runtime: engine.kind,
      current: true,
      verify: true,
    });
    bytes += Buffer.byteLength(JSON.stringify(part), 'utf8') + 1;
    if (bytes > PROVIDER_TURN_MAX_BYTES || !PROVIDER_CONTENT.safeParse(part).success)
      throw inputTooLarge();
    parts.push(part);
  }
  if (engine.kind === 'codex') assertCodexModalities(resources.store, engine, parts);
  return { role: 'user', content: parts };
}

function assertCodexModalities(
  store: Store,
  engine: Extract<ComputerEngine, { readonly kind: 'codex' }>,
  parts: readonly ProviderContent[],
): void {
  const model = store.computerRuntimes
    .models({ device_id: engine.device_id, runtime: engine.kind })
    .find((entry) => entry.id === engine.model || entry.resolved_model === engine.model);
  if (model?.available !== true)
    throw new ApiError('conflict', 'The selected Codex model is unavailable on this computer.');
  if (parts.some(({ type }) => type === 'document' || !model.input_modalities.includes(type)))
    throw new ApiError(
      'invalid_request',
      'The selected Codex model cannot accept these attachments.',
    );
}

function inputTooLarge(): ApiError {
  return new ApiError(
    'invalid_request',
    'The message and attachments exceed the provider input limit.',
  );
}

function inProviderHistory(row: AssistantMessageRow): boolean {
  return (
    !isHelperDialogueMirror(row) &&
    !(row.role === 'responder' && row.state === 'working') &&
    (row.text !== '' || row.attachments.length > 0)
  );
}
export async function steerContent(
  resources: { readonly store: Store; readonly files: AssistantFiles },
  event: StoredEvent,
  text: string,
): Promise<ProviderContent[]> {
  const content: ProviderContent[] = [{ type: 'text', text }];
  if (event.message_id === null) return content;
  const { store, files } = resources;
  for (const file of store.assistantChat.attachmentsOf(event.message_id))
    content.push(
      await attachmentContent(files, file, { runtime: 'claude', current: true, verify: false }),
    );
  return content;
}

async function messageContent(
  resources: { readonly store: Store; readonly files: AssistantFiles },
  row: AssistantMessageRow,
  options: {
    readonly runtime: 'claude' | 'codex';
    readonly current: boolean;
    readonly quote: string | null;
  },
): Promise<ProviderTurn['messages'][number]> {
  const { store, files } = resources;
  const content = await messageParts(files, store.assistantChat.attachmentsOf(row.id), {
    ...options,
    verify: isHelperDialogueMessage(row),
    text: row.text,
  });
  return { role: row.role === 'responder' ? 'assistant' : 'user', content };
}

async function messageParts(
  files: AssistantFiles,
  attachments: readonly StoredAttachment[],
  options: {
    readonly runtime: 'claude' | 'codex';
    readonly current: boolean;
    readonly quote: string | null;
    readonly text: string;
    readonly verify: boolean;
  },
): Promise<ProviderContent[]> {
  const parts = textParts(options.text, options.quote);
  for (const file of attachments) parts.push(await attachmentContent(files, file, options));
  return parts;
}

function textParts(text: string, quote: string | null): ProviderContent[] {
  const parts: ProviderContent[] = [];
  if (quote !== null)
    parts.push({
      type: 'text',
      text: HELPER_QUOTE_PREFIX + quote.slice(0, PROVIDER_TEXT_MAX - HELPER_QUOTE_PREFIX.length),
    });
  if (text !== '') parts.push({ type: 'text', text });
  return parts;
}

function cachedMedia(mime: string, current: boolean): boolean {
  return mediaKindOf(mime) !== null && (!current || !PROVIDER_IMAGE_MIME.safeParse(mime).success);
}
