import { setAttachmentTranscript } from './assistant-attachment-transcripts';
import { messageWithToolCall } from './assistant-tool-call-lookup';
import {
  STORED_MESSAGE,
  STORED_MESSAGE_COLUMNS,
  MESSAGE_COLUMNS,
} from './assistant-message-storage';
export { STORED_MESSAGE, MESSAGE_COLUMNS } from './assistant-message-storage';
import {
  ASSISTANT_SETTINGS,
  ASSISTANT_SETTINGS_WRITE,
  type AssistantMessageRow,
  type AssistantReasonCode,
  type AssistantSettings,
} from '@smarteverything/domain';
import { z } from 'zod';
import { readResponseStyle, saveResponseStyle } from './assistant-response-style';
import { CALL_TEXT, type CallText } from './assistant-call-text';
export type { CallText } from './assistant-call-text';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';
import {
  FILE_COLUMNS,
  STORED_FILE,
  type NewAttachment,
  type StoredAttachment,
} from './assistant-files';

export type { NewAttachment, StoredAttachment };
export { summaryOf } from './assistant-files';

const STORED_SETTINGS = storedRow(z.strictObject({ settings: ASSISTANT_SETTINGS }), {
  json: ['settings'],
});

import type { NewAssistantMessage, AssistantMessageChange } from './assistant-message-contract';
export type { NewAssistantMessage, AssistantMessageChange } from './assistant-message-contract';

const LATEST_AT = storedRow(
  z.strictObject({ at: z.iso.datetime({ offset: true }).nullable() }),
  {},
);

export interface MessagePage {
  readonly chatId: string;
  readonly before?: string | undefined;
  readonly limit: number;
}

export class AssistantChatRepository {
  constructor(private readonly context: StoreContext) {}

  settings(): AssistantSettings {
    const row = this.context.sql.get(
      STORED_SETTINGS,
      'select settings from assistant_settings where id = 1',
    );
    return {
      ...(row === undefined ? ASSISTANT_SETTINGS.parse({}) : row.settings),
      response_style: readResponseStyle(this.context),
    };
  }

  saveSettings(settings: AssistantSettings): AssistantSettings {
    const parsed = ASSISTANT_SETTINGS_WRITE.parse(settings);
    const { response_style: style, ...legacy } = parsed;
    this.context.write(() => {
      this.context.sql.run(
        'save the assistant settings',
        `insert into assistant_settings (id, settings, updated_at) values (1, $settings, $now)
         on conflict (id) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { settings: jsonText(legacy), now: this.context.now() },
      );
      if (style !== undefined) saveResponseStyle(this.context, style);
    });
    return parsed;
  }

  find(id: string): AssistantMessageRow | undefined {
    return this.context.sql.get(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages where id = $id`,
      { id },
    );
  }

  message(id: string): AssistantMessageRow {
    return found(this.find(id), 'assistant message', id);
  }

  messages(page: MessagePage): AssistantMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and ($before is null or created_at < $before)
       order by created_at desc, rowid desc limit $limit`,
      { chat: page.chatId, before: page.before ?? null, limit: page.limit },
    );
  }

  latestPersonText(chatId: string): AssistantMessageRow | undefined {
    return this.context.sql.get(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and role = 'person' and kind = 'text'
       order by created_at desc, rowid desc limit 1`,
      { chat: chatId },
    );
  }

  latestSettledReply(chatId: string): AssistantMessageRow | undefined {
    return this.context.sql.get(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and role = 'responder' and kind = 'text' and state in ('answered', 'failed')
       order by created_at desc, rowid desc limit 1`,
      { chat: chatId },
    );
  }

  repliesTo(messageId: string): AssistantMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where reply_to = $message and role = 'responder' and kind = 'text'
       order by created_at, rowid`,
      { message: messageId },
    );
  }

  latestWithEmbed(chatId: string, kind: string): AssistantMessageRow | undefined {
    return this.context.sql.get(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat
         and exists (select 1 from json_each(embeds) where json_extract(value, '$.kind') = $kind)
       order by created_at desc, rowid desc limit 1`,
      { chat: chatId, kind },
    );
  }

  withToolCall(chatId: string, callId: string): AssistantMessageRow | undefined {
    return messageWithToolCall(this.context, chatId, callId);
  }

  since(chatId: string, after: string | null): AssistantMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and ($after is null or created_at > $after)
       order by created_at, rowid`,
      { chat: chatId, after },
    );
  }

  callTextsOfSource(query: {
    readonly profileId: string;
    readonly sourceKey: string;
    readonly exceptChatId: string;
    readonly limit: number;
  }): CallText[] {
    return this.context.sql.all(
      CALL_TEXT,
      `select m.created_at as at, m.text as text from assistant_messages m
       join ai_chats c on c.id = m.chat_id
       where c.profile_id = $profile and c.source_key = $source and c.archived_at is null
         and c.id <> $except and m.kind = 'call' and m.text <> ''
       order by m.created_at desc, m.rowid desc limit $limit`,
      {
        profile: query.profileId,
        source: query.sourceKey,
        except: query.exceptChatId,
        limit: query.limit,
      },
    );
  }

  recent(profileId: string, limit: number): AssistantMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages where profile_id = $profile
       order by created_at desc, rowid desc limit $limit`,
      { profile: profileId, limit },
    );
  }

  addMessage(
    input: NewAssistantMessage,
    stamp?: { readonly createdAt: string; readonly updatedAt: string },
    messageId?: string,
  ): AssistantMessageRow {
    return this.context.write(() => {
      const id = messageId ?? this.context.newId();
      const createdAt = stamp?.createdAt ?? this.nextMoment(input.chat_id);
      this.context.sql.run(
        'add the assistant message',
        `insert into assistant_messages (${STORED_MESSAGE_COLUMNS})
         values ($id, $profile, $client, $role, $kind, $author, $text, $attachments, $references, $state,
                 $reason, $reasonCode, $clientMessage, $steps, $stepStates, $replyTo, $chat, $origin, $embeds, $cost,
                 $model, $createdAt, $updatedAt)`,
        {
          id,
          profile: input.profile_id,
          client: input.client_id,
          role: input.role,
          kind: input.kind,
          author: input.author,
          text: input.text,
          attachments: jsonText(input.attachments),
          references: jsonText(input.references ?? []),
          state: input.state,
          reason: input.reason,
          reasonCode: input.reason_code ?? null,
          clientMessage: input.client_message_id ?? null,
          steps: jsonText(input.steps),
          stepStates: jsonText(input.step_states),
          replyTo: input.reply_to,
          chat: input.chat_id,
          origin: input.origin === null ? null : jsonText(input.origin),
          embeds: jsonText(input.embeds),
          cost: input.cost_micros,
          model: input.model,
          createdAt,
          updatedAt: stamp?.updatedAt ?? createdAt,
        },
      );
      const row = this.message(id);
      this.context.changed('assistant_messages', 'INSERT', row, null);
      return row;
    });
  }

  private nextMoment(chatId: string): string {
    const now = this.context.now();
    const latest = this.context.sql.get(
      LATEST_AT,
      'select max(created_at) as at from assistant_messages where chat_id = $chat',
      { chat: chatId },
    )?.at;
    if (latest === null || latest === undefined || latest < now) {
      return now;
    }
    return new Date(Date.parse(latest) + 1).toISOString();
  }

  updateMessage(id: string, change: AssistantMessageChange): AssistantMessageRow {
    return this.context.write(() => {
      const before = this.message(id);
      const set = assignments({
        state: change.state,
        reason: change.reason,
        reason_code: change.reason_code,
        text: change.text,
        references_json: change.references === undefined ? undefined : jsonText(change.references),
        model: change.model,
        attachments: change.attachments === undefined ? undefined : jsonText(change.attachments),
        steps: change.steps === undefined ? undefined : jsonText(change.steps),
        step_states: change.step_states === undefined ? undefined : jsonText(change.step_states),
        embeds: change.embeds === undefined ? undefined : jsonText(change.embeds),
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'change the assistant message',
        `update assistant_messages set ${set.text} where id = $id`,
        { ...set.parameters, id },
      );
      const after = this.message(id);
      this.context.changed('assistant_messages', 'UPDATE', after, before);
      return after;
    });
  }

  removeMessages(ids: readonly string[]): StoredAttachment[] {
    return this.context.write(() =>
      ids.flatMap((id) => {
        const before = this.message(id);
        const files = this.attachmentsOf(id);
        this.context.sql.run(
          'remove the assistant message',
          'delete from assistant_messages where id = $id',
          { id },
        );
        this.context.changed('assistant_messages', 'DELETE', null, before);
        return files;
      }),
    );
  }

  messageIdsOf(chatId: string): string[] {
    return this.context.sql
      .all(
        z.strictObject({ id: z.uuid() }),
        'select id from assistant_messages where chat_id = $chat',
        { chat: chatId },
      )
      .map((row) => row.id);
  }

  failWorking(reason: string, code: AssistantReasonCode): void {
    this.context.write(() => {
      const ids = this.context.sql
        .all(
          z.strictObject({ id: z.uuid() }),
          "select id from assistant_messages where role = 'responder' and state = 'working'",
        )
        .map((row) => row.id);
      ids.forEach((id) => {
        this.updateMessage(id, { state: 'failed', reason, reason_code: code });
      });
    });
  }

  addCost(messageId: string, deltaMicros: number): void {
    this.context.write(() => {
      const before = this.message(messageId);
      this.context.sql.run(
        'add the cost to the assistant message',
        'update assistant_messages set cost_micros = max(0, cost_micros + $delta) where id = $id',
        { id: messageId, delta: Math.round(deltaMicros) },
      );
      this.context.changed('assistant_messages', 'UPDATE', this.message(messageId), before);
    });
  }

  addAttachment(input: NewAttachment): StoredAttachment {
    return this.context.write(() => {
      const { id } = input;
      this.context.sql.run(
        'keep the assistant attachment',
        `insert into assistant_attachments (${FILE_COLUMNS})
         values ($id, null, $profile, $name, $mime, $bytes, $width, $height, $path, $sha, null, $now)`,
        {
          id,
          profile: input.profile_id,
          name: input.name,
          mime: input.mime,
          bytes: input.bytes,
          width: input.width,
          height: input.height,
          path: input.storage_path,
          sha: input.sha256,
          now: this.context.now(),
        },
      );
      return this.attachment(id);
    });
  }

  setTranscript(id: string, transcript: string): void {
    setAttachmentTranscript(this.context, this, id, transcript);
  }

  attachment(id: string): StoredAttachment {
    return found(
      this.context.sql.get(
        STORED_FILE,
        `select ${FILE_COLUMNS} from assistant_attachments where id = $id`,
        { id },
      ),
      'assistant attachment',
      id,
    );
  }

  attachmentsOf(messageId: string): StoredAttachment[] {
    return this.context.sql.all(
      STORED_FILE,
      `select ${FILE_COLUMNS} from assistant_attachments where message_id = $message order by rowid`,
      { message: messageId },
    );
  }

  attachmentsOfChat(chatId: string): StoredAttachment[] {
    return this.context.sql.all(
      STORED_FILE,
      `select ${FILE_COLUMNS.split(', ')
        .map((column) => `f.${column}`)
        .join(', ')} from assistant_attachments f
       join assistant_messages m on m.id = f.message_id
       where m.chat_id = $chat
       order by f.rowid`,
      { chat: chatId },
    );
  }

  answerFiles(chatId: string, afterMessageId: string): StoredAttachment[] {
    return this.context.sql.all(
      STORED_FILE,
      `select ${FILE_COLUMNS.split(', ')
        .map((column) => `f.${column}`)
        .join(', ')} from assistant_attachments f
       join assistant_messages m on m.id = f.message_id
       where m.chat_id = $chat and m.role = 'responder'
         and m.created_at >= (select created_at from assistant_messages where id = $after)
       order by f.rowid`,
      { chat: chatId, after: afterMessageId },
    );
  }

  attachTo(messageId: string, ids: readonly string[]): void {
    this.context.write(() => {
      ids.forEach((id) => {
        this.context.sql.run(
          'attach the file to the assistant message',
          'update assistant_attachments set message_id = $message where id = $id and message_id is null',
          { message: messageId, id },
        );
      });
    });
  }

  unattachedBefore(moment: string): StoredAttachment[] {
    return this.context.sql.all(
      STORED_FILE,
      `select ${FILE_COLUMNS} from assistant_attachments
       where message_id is null and created_at < $moment`,
      { moment },
    );
  }

  removeAttachments(ids: readonly string[]): void {
    this.context.write(() => {
      ids.forEach((id) => {
        this.context.sql.run(
          'remove the assistant attachment',
          'delete from assistant_attachments where id = $id',
          { id },
        );
      });
    });
  }
}
