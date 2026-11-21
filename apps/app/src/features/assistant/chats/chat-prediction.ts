import {
  NEW_CHAT_TITLE,
  type AiChatChange,
  type AiChatRow,
  type Engine,
} from '@smarteverything/domain';

const LATEST_MESSAGE = 1;

function archivedAt(row: AiChatRow, archived: boolean | undefined, now: string): string | null {
  if (archived === undefined) return row.archived_at;
  return archived ? (row.archived_at ?? now) : null;
}

function readState(
  row: AiChatRow,
  read: boolean | undefined,
  now: string,
): Pick<AiChatRow, 'read_at' | 'unread_count'> {
  if (read === undefined) return { read_at: row.read_at, unread_count: row.unread_count };
  if (read) return { read_at: now, unread_count: 0 };
  return { read_at: row.read_at, unread_count: Math.max(row.unread_count, LATEST_MESSAGE) };
}

export function chatAfter(row: AiChatRow, change: AiChatChange, at: Date): AiChatRow {
  const now = at.toISOString();
  return {
    ...row,
    ...(change.title === undefined ? {} : { title: change.title }),
    ...(change.icon === undefined ? {} : { icon: change.icon }),
    ...(change.pinned === undefined ? {} : { pinned: change.pinned }),
    ...(change.memory === undefined ? {} : { memory: change.memory }),
    ...(change.tools === undefined ? {} : { tools: change.tools }),
    ...(change.engine === undefined ? {} : { engine: change.engine }),
    archived_at: archivedAt(row, change.archived, now),
    ...readState(row, change.read, now),
  };
}

export function startedChat(
  start: { readonly id: string; readonly profileId: string; readonly engine: Engine },
  at: Date,
): AiChatRow {
  const now = at.toISOString();
  return {
    id: start.id,
    profile_id: start.profileId,
    deletion_state: null,
    deletion_error: null,
    kind: 'chat',
    title: NEW_CHAT_TITLE,
    icon: null,
    parent_id: null,
    helper_name: null,
    source_key: null,
    engine: start.engine,
    native_admission: null,
    pending_execution_target: null,
    tools: null,
    pinned: false,
    memory: true,
    archived_at: null,
    cost_micros: 0,
    origin: null,
    read_at: now,
    unread_count: 0,
    pending_requests: 0,
    context_percent: null,
    last_input_tokens: null,
    last_cached_tokens: null,
    cache_percent: null,
    branch_message_id: null,
    last_message_at: now,
    created_at: now,
    updated_at: now,
  };
}
