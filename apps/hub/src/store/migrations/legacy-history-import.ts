import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ASSISTANT_MESSAGE_ROW,
  DSH_SESSION_HEADER,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { jsonText, type Sql } from '../sql';
import { storedRow } from '../codec';
import { LegacyHistoryEvents } from './legacy-history-events';
import type { Migration } from './migration';

const PENDING_CHAT = z.strictObject({
  id: z.string(),
  profile_id: z.string(),
  kind: z.string(),
  created_at: z.string(),
  session_id: z.string().nullable(),
});
const LEGACY_MESSAGE_ROW = ASSISTANT_MESSAGE_ROW.pick({
  id: true,
  profile_id: true,
  client_id: true,
  role: true,
  kind: true,
  author: true,
  text: true,
  attachments: true,
  references: true,
  state: true,
  reason: true,
  reason_code: true,
  client_message_id: true,
  steps: true,
  step_states: true,
  reply_to: true,
  quote: true,
  chat_id: true,
  origin: true,
  embeds: true,
  cost_micros: true,
  cost_incomplete: true,
  model: true,
  created_at: true,
  updated_at: true,
});

const LEGACY_MESSAGE = storedRow(LEGACY_MESSAGE_ROW, {
  json: ['attachments', 'references', 'steps', 'step_states', 'quote', 'origin', 'embeds'],
  flags: ['cost_incomplete'],
});

const LEGACY_COLUMNS = `id, profile_id, client_id, role, kind, author, text, attachments,
  references_json as "references", state, reason, reason_code, client_message_id, steps,
  step_states, reply_to, null as quote, chat_id, origin, embeds, cost_micros, model, created_at, updated_at,
  exists(select 1 from ai_usage where message_id=assistant_messages.id and cost_state <> 'reconciled' and json_extract(meta, '$.cost_available') = 0) as cost_incomplete`;

const SESSION_ROW = z.strictObject({ header: z.string(), next_seq: z.int().nonnegative() });

function pendingChats(sql: Sql): z.infer<typeof PENDING_CHAT>[] {
  return sql.all(
    PENDING_CHAT,
    `select c.id, c.profile_id, c.kind, c.created_at, json_extract(c.engine, '$.session_id') as session_id
     from ai_chats c
     where json_extract(c.engine, '$.kind') = 'dsh'
       and not exists (select 1 from harness_forks f where f.chat_id = c.id)
       and not exists (
         select 1 from dsh_sessions s
         where s.session_id = json_extract(c.engine, '$.session_id') and s.next_seq > 0
       )
       and exists (
         select 1 from assistant_messages m
         where m.chat_id = c.id and (m.state is null or m.state not in ('queued', 'working'))
       )
     order by c.created_at, c.id`,
  );
}

function settledRows(sql: Sql, chat: string): AssistantMessageRow[] {
  return sql
    .all(
      LEGACY_MESSAGE,
      `select ${LEGACY_COLUMNS} from assistant_messages
       where chat_id = $chat order by created_at, rowid`,
      { chat },
    )
    .filter((row) => row.state !== 'queued' && row.state !== 'working');
}

function openedSession(sql: Sql, chat: z.infer<typeof PENDING_CHAT>): string {
  if (chat.session_id !== null) {
    const stored = sql.get(
      SESSION_ROW,
      'select header, next_seq from dsh_sessions where session_id = $id',
      { id: chat.session_id },
    );
    if (stored !== undefined) return chat.session_id;
  }
  const id = randomUUID();
  const header = DSH_SESSION_HEADER.parse({
    version: 4,
    id,
    createdAt: Date.parse(chat.created_at),
    isSeeded: false,
    agentPreset: 'smarteverything',
  });
  sql.run(
    'create the native session that carries a chat history',
    `insert into dsh_sessions(session_id, chat_id, profile_id, header, inherited_event_count, next_seq, epoch, claim, created_at)
     values ($id, $chat, $profile, $header, 0, 0, 0, null, $now)`,
    {
      id,
      chat: chat.id,
      profile: chat.profile_id,
      header: jsonText(header),
      now: chat.created_at,
    },
  );
  sql.run(
    'bind the chat to its native session',
    "update ai_chats set engine = json_set(engine, '$.session_id', $id) where id = $chat",
    { id, chat: chat.id },
  );
  return id;
}

function sessionHeader(sql: Sql, id: string): string {
  const stored = sql.get(
    SESSION_ROW,
    'select header, next_seq from dsh_sessions where session_id = $id',
    { id },
  );
  if (stored === undefined) throw new Error('The native session vanished during its migration.');
  return stored.header;
}

function writeHistory(sql: Sql, id: string, rows: readonly AssistantMessageRow[]): number {
  const events = new LegacyHistoryEvents(JSON.parse(sessionHeader(sql, id)));
  for (const row of rows) events.append(row);
  const written = events.history();
  for (const event of written)
    sql.run(
      'store an imported native session event',
      'insert into dsh_session_events(session_id, seq, event) values ($id, $seq, $event)',
      { id, seq: event.seq, event: jsonText(event) },
    );
  sql.run(
    'advance the imported native session prefix',
    'update dsh_sessions set next_seq = $next where session_id = $id',
    { id, next: written.length },
  );
  return written.length;
}

export function importLegacyHistories(sql: Sql): LogPayload {
  let chats = 0;
  let events = 0;
  for (const chat of pendingChats(sql)) {
    const rows = settledRows(sql, chat.id);
    if (rows.length === 0) continue;
    events += writeHistory(sql, openedSession(sql, chat), rows);
    chats += 1;
  }
  return { chats, events };
}

export const LEGACY_HISTORY_IMPORT_MIGRATION: Migration = {
  version: 152,
  name: 'legacy-history-import',
  statements: [],
  backfill: importLegacyHistories,
};
