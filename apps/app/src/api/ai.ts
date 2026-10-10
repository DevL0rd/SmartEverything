import {
  AI_CHAT_AREA_ENDPOINTS as C,
  AI_MODEL_ENDPOINTS as M,
  type AiChatChange,
  type AiChatNew,
  type AiChatRow,
  type AiModelChoice,
  type AiModelKind,
  type AiModelList,
  type AiModelRow,
  type AiModelSuggested,
  type AiProviderCount,
  type AssistantMessageRow,
  type AssistantModels,
  type EngineKind,
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

export async function removeAiChat(chatId: string): Promise<void> {
  await api().call(C.removeAiChat, { params: { chatId } });
  log.info('chat.removed', { chatId });
}

export async function olderChatMessages(
  chatId: string,
  before: string,
): Promise<AssistantMessageRow[]> {
  return api().call(C.listAiChatMessages, { params: { chatId }, query: { before, limit: 50 } });
}

export async function sendAiChatMessage(
  chatId: string,
  text: string,
  attachments: readonly string[],
): Promise<AssistantMessageRow> {
  const row = await api().call(C.sendAiChatMessage, {
    params: { chatId },
    body: { text, attachments: [...attachments] },
  });
  log.info('chat.sent', { chatId, attachments: attachments.length });
  return row;
}

export async function interruptAiChat(chatId: string): Promise<void> {
  await api().call(C.interruptAiChat, { params: { chatId } });
  log.info('chat.interrupted', { chatId });
}

export async function readEngineModels(kind: EngineKind): Promise<AssistantModels> {
  return api().call(C.readEngineModels, { params: { kind } });
}
