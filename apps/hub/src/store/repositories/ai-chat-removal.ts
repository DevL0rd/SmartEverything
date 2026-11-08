import type { AiChatRow } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { UsageStore } from '../../ledger/usage-store';
import { AssistantChatRepository, MESSAGE_COLUMNS, STORED_MESSAGE } from './assistant-chat';

export function removeStoredChat(
  context: StoreContext,
  chat: AiChatRow,
  read: (id: string) => AiChatRow,
): void {
  context.write(() => {
    const messages = context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages where chat_id=$id`,
      { id: chat.id },
    );
    const children = context.sql
      .all(z.strictObject({ id: z.uuid() }), 'select id from ai_chats where parent_id=$id', {
        id: chat.id,
      })
      .map((row) => read(row.id));
    context.sql.run(
      'detach native forks from the deleted source conversation',
      `delete from harness_forks where parent_session in
       (select session_id from dsh_sessions where chat_id=$id)`,
      { id: chat.id },
    );
    foldHelperCost(context, chat, read);
    removeChildAgentRuns(context, chat.id, read);
    failRemovedHelperMessages(context, chat.id);
    context.sql.run('remove the AI chat', 'delete from ai_chats where id=$id', { id: chat.id });
    for (const message of messages) context.changed('assistant_messages', 'DELETE', null, message);
    for (const child of children) context.changed('ai_chats', 'UPDATE', read(child.id), child);
    context.changed('ai_chats', 'DELETE', null, chat);
  });
}

function failRemovedHelperMessages(context: StoreContext, chatId: string): void {
  const pending = context.sql.all(
    z.strictObject({ id: z.uuid() }),
    `select id from assistant_messages where state is null and id in
       (select helper_parent_message_id from assistant_events where chat_id=$id)`,
    { id: chatId },
  );
  const messages = new AssistantChatRepository(context);
  for (const { id } of pending)
    messages.updateMessage(id, {
      state: 'failed',
      reason: 'The addressed helper was removed.',
      reason_code: 'unknown',
    });
}

function removeChildAgentRuns(
  context: StoreContext,
  chatId: string,
  read: (id: string) => AiChatRow,
): void {
  const parents = context.sql
    .all(
      z.strictObject({ id: z.uuid() }),
      `select distinct parent_chat_id as id from ai_agent_runs
     where json_extract(projection,'$.child_chat_id')=$id and parent_chat_id<>$id`,
      { id: chatId },
    )
    .map((row) => read(row.id));
  context.sql.run(
    'remove deleted child chat agent projections',
    `delete from ai_agent_runs where json_extract(projection,'$.child_chat_id')=$id`,
    { id: chatId },
  );
  for (const parent of parents) context.changed('ai_chats', 'UPDATE', read(parent.id), parent);
}

function foldHelperCost(
  context: StoreContext,
  chat: AiChatRow,
  read: (id: string) => AiChatRow,
): void {
  if (chat.kind !== 'subagent' || chat.parent_id === null) return;
  const parent = read(chat.parent_id);
  const moved = new UsageStore(context).reattribute(chat.id, parent.id);
  context.sql.run(
    'keep the deleted helper cost in its parent chat',
    'update ai_chats set cost_micros = cost_micros + $cost where id = $id',
    { id: parent.id, cost: chat.cost_micros },
  );
  for (const row of moved)
    context.changed('ai_usage', 'UPDATE', { ...row, chat_id: parent.id }, row);
  context.changed('ai_chats', 'UPDATE', read(parent.id), parent);
}
