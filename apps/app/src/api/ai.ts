import {
  AI_CHAT_AREA_ENDPOINTS as C,
  AI_MODEL_ENDPOINTS as M,
  type AiChatBranch,
  type AiChatChange,
  type AiChatHit,
  type AiChatNew,
  type AiChatRow,
  type AiModelChoice,
  type AiModelKind,
  type AiModelSearch,
  type AiModelSearchRequest,
  type AiModelList,
  type AiModelRow,
  type AiModelSuggested,
  type AiProviderCount,
  type AiToolResultPage,
  type AiRetryFrom,
  type AiMessageReference,
  type AssistantMessageRow,
  type MessageSource,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.assistant');

export interface ModelPageQuery {
  readonly kind: AiModelKind;
  readonly q?: string;
  readonly provider?: string;
  readonly cursor?: string;
}

export async function listAiModels(query: ModelPageQuery): Promise<AiModelList> {
  return api().call(M.listAiModels, { query: { limit: 30, ...query } });
}

export async function searchAiModels(
  query: Omit<AiModelSearchRequest, 'limit' | 'gone'>,
): Promise<AiModelSearch> {
  return api().call(M.searchAiModels, { query: { ...query, limit: 30, gone: false } });
}

export async function suggestedAiModels(
  kind: AiModelKind,
  current: AiModelChoice | null,
): Promise<AiModelSuggested> {
  return api().call(M.suggestedAiModels, {
    query: current === null ? { kind } : { kind, current },
  });
}

export async function listAiModelProviders(kind: AiModelKind): Promise<AiProviderCount[]> {
  return api().call(M.listAiModelProviders, { query: { kind } });
}

export async function readAiModel(id: string): Promise<AiModelRow> {
  return (await api().call(M.readAiModel, { params: { id } })).model;
}

interface ChatListQuery {
  readonly archived?: boolean;
  readonly before?: string;
  readonly limit?: number;
  readonly unread?: boolean;
  readonly pinned?: boolean;
  readonly source?: MessageSource;
}

export async function listAiChats(query: ChatListQuery): Promise<AiChatRow[]> {
  return api().call(C.listAiChats, { query });
}

interface ChatSearchQuery {
  readonly chatId?: string;
  readonly archived?: boolean;
  readonly limit?: number;
}

export async function searchAiChats(q: string, options: ChatSearchQuery): Promise<AiChatHit[]> {
  return api().call(C.searchAiChats, { query: { q, ...options } });
}

export async function createAiChat(chat: AiChatNew): Promise<AiChatRow> {
  const row = await api().call(C.createAiChat, { body: chat });
  log.info('chat.created', { chatId: row.id });
  return row;
}

export async function updateAiChat(chatId: string, change: AiChatChange): Promise<AiChatRow> {
  const row = await api().call(C.updateAiChat, { params: { chatId }, body: change });
  log.info('chat.updated', { chatId, fields: Object.keys(change) });
  return row;
}

export async function setAiChatRead(chatId: string, read: boolean): Promise<AiChatRow> {
  return updateAiChat(chatId, { read });
}

export async function branchAiChat(
  chatId: string,
  messageId: string,
  engine?: AiChatBranch['engine'],
): Promise<AiChatRow> {
  const row = await api().call(C.branchAiChat, {
    params: { chatId },
    body: engine === undefined ? { messageId } : { messageId, engine },
  });
  log.info('chat.branched', { chatId, messageId, branchId: row.id });
  return row;
}

export async function removeAiChat(chatId: string, expectedInactiveRunId?: string): Promise<void> {
  await api().call(C.removeAiChat, {
    params: { chatId },
    query:
      expectedInactiveRunId === undefined
        ? {}
        : { expected_inactive_run_id: expectedInactiveRunId },
  });
  log.info('chat.removed', { chatId });
}

export async function olderChatMessages(
  chatId: string,
  before: string,
): Promise<AssistantMessageRow[]> {
  return api().call(C.listAiChatMessages, { params: { chatId }, query: { before, limit: 50 } });
}

export async function latestChatMessages(chatId: string): Promise<AssistantMessageRow[]> {
  return api().call(C.listAiChatMessages, { params: { chatId }, query: { limit: 50 } });
}

export async function sendAiChatMessage(
  chatId: string,
  text: string,
  attachments: readonly string[],
  options: {
    readonly clientMessageId?: string;
    readonly references?: readonly AiMessageReference[];
  } = {},
): Promise<AssistantMessageRow> {
  const { clientMessageId, references = [] } = options;
  const row = await api().call(C.sendAiChatMessage, {
    params: { chatId },
    body: {
      text,
      attachments: [...attachments],
      ...(references.length === 0 ? {} : { references: [...references] }),
      ...(clientMessageId === undefined ? {} : { client_message_id: clientMessageId }),
    },
  });
  log.info('chat.sent', { chatId, attachments: attachments.length });
  return row;
}

export async function retryAiChatMessage(
  chatId: string,
  messageId: string,
  from: AiRetryFrom,
): Promise<AssistantMessageRow> {
  const row = await api().call(C.retryAiChatMessage, {
    params: { chatId, messageId },
    body: { from },
  });
  log.info('chat.retried', { chatId, messageId, from });
  return row;
}

export async function editAiChatMessage(
  chatId: string,
  messageId: string,
  text: string,
  options: {
    readonly attachments?: readonly string[];
    readonly references?: readonly AiMessageReference[];
  } = {},
): Promise<AssistantMessageRow> {
  const { attachments, references } = options;
  const row = await api().call(C.editAiChatMessage, {
    params: { chatId, messageId },
    body: {
      text,
      ...(attachments === undefined ? {} : { attachments: [...attachments] }),
      ...(references === undefined ? {} : { references: [...references] }),
    },
  });
  log.info('chat.edited', { chatId, messageId });
  return row;
}

export async function interruptAiChat(chatId: string): Promise<void> {
  await api().call(C.interruptAiChat, { params: { chatId } });
  log.info('chat.interrupted', { chatId });
}

export async function compactAiChat(chatId: string): Promise<boolean> {
  const result = await api().call(C.compactAiChat, { params: { chatId } });
  log.info('chat.compacted', { chatId, compacted: result.compacted });
  return result.compacted;
}

export async function readFullToolOutput(chatId: string, callId: string): Promise<string> {
  let text = '';
  let cursor: string | null = '0';
  while (cursor !== null) {
    const page: AiToolResultPage = await api().call(C.readAiToolResult, {
      params: { chatId, callId },
      query: { field: 'output', cursor },
    });
    text += page.text;
    cursor = page.nextCursor;
  }
  return text;
}
