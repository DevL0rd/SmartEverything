import type { AssistantMessageRow } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../../store/state';
import { isComputerEngine } from '../provider/computer-engine';

const latestPersonByTable = new WeakMap<object, ReadonlyMap<string, string>>();

function latestPersonIds(
  table: StoreState['tables']['assistant_messages'],
): ReadonlyMap<string, string> {
  const known = latestPersonByTable.get(table);
  if (known !== undefined) return known;
  const latest = new Map<string, string>();
  for (const row of rowsOf(table)) {
    if (row.role === 'person' && row.kind === 'text' && !latest.has(row.chat_id)) {
      latest.set(row.chat_id, row.id);
    }
  }
  latestPersonByTable.set(table, latest);
  return latest;
}

export function latestPersonId(state: StoreState, chatId: string): string | null {
  return latestPersonIds(state.tables.assistant_messages).get(chatId) ?? null;
}

function copiedIntoBranch(state: StoreState, row: AssistantMessageRow): boolean {
  const chat = state.tables.ai_chats.byId[row.chat_id];
  return chat !== undefined && chat.branch_message_id !== null && row.created_at < chat.created_at;
}

export function canContinue(state: StoreState, request: AssistantMessageRow | null): boolean {
  if (request?.state !== 'failed' || copiedIntoBranch(state, request)) {
    return false;
  }
  return latestPersonId(state, request.chat_id) === request.id;
}

export interface RowActionState {
  readonly request: AssistantMessageRow | null;
  readonly canEdit: boolean;
  readonly readOnly: boolean;
}

function requestOf(state: StoreState, row: AssistantMessageRow): AssistantMessageRow | null {
  if (row.role === 'person') return row;
  return row.reply_to === null
    ? null
    : (state.tables.assistant_messages.byId[row.reply_to] ?? null);
}

export function rowActionState(state: StoreState, row: AssistantMessageRow): RowActionState {
  const request = requestOf(state, row);
  const chat = state.tables.ai_chats.byId[row.chat_id];
  return {
    request,
    canEdit: editableOf(state, row),
    readOnly:
      chat !== undefined && isComputerEngine(chat.engine) && state.session?.client.role !== 'owner',
  };
}

function writtenInApp(row: AssistantMessageRow): boolean {
  return row.origin === null || row.origin.source === 'app';
}

export function editableOf(state: StoreState, row: AssistantMessageRow): boolean {
  const settled = row.state === 'answered' || row.state === 'failed';
  return (
    row.role === 'person' &&
    row.kind === 'text' &&
    writtenInApp(row) &&
    settled &&
    !copiedIntoBranch(state, row) &&
    latestPersonId(state, row.chat_id) === row.id
  );
}
