import {
  ASSISTANT_ATTACHMENT,
  ASSISTANT_MESSAGE_ROW,
  ASSISTANT_SETTINGS,
  type AssistantAttachment,
  type AssistantMessageRow,
  type AssistantSettings,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_MESSAGE = storedRow(ASSISTANT_MESSAGE_ROW, {
  json: ['attachments', 'steps', 'origin', 'embeds'],
});

const STORED_SETTINGS = storedRow(z.strictObject({ settings: ASSISTANT_SETTINGS }), {
  json: ['settings'],
});

const MESSAGE_TEXT = storedRow(z.strictObject({ text: z.string() }), {});

const STORED_FILE = storedRow(
  ASSISTANT_ATTACHMENT.extend({
    message_id: z.uuid().nullable(),
    profile_id: z.uuid(),
    storage_path: z.string().min(1),
    sha256: z.string().length(64),
    created_at: z.iso.datetime({ offset: true }),
  }),
  {},
);

export type StoredAttachment = z.output<typeof STORED_FILE>;

const MESSAGE_COLUMNS =
  'id, profile_id, client_id, role, kind, author, text, attachments, state, reason, steps, reply_to, chat_id, origin, embeds, cost_micros, model, created_at, updated_at';

const FILE_COLUMNS =
  'id, message_id, profile_id, name, mime, bytes, width, height, storage_path, sha256, created_at';

export type NewAssistantMessage = Omit<AssistantMessageRow, 'id' | 'created_at' | 'updated_at'>;

export type AssistantMessageChange = Partial<
  Pick<AssistantMessageRow, 'state' | 'reason' | 'steps' | 'text' | 'model' | 'embeds'>
>;

export interface MessagePage {
  readonly chatId: string;
  readonly before?: string | undefined;
  readonly limit: number;
}

export type NewAttachment = Omit<StoredAttachment, 'created_at' | 'message_id'>;

export class AssistantChatRepository {
  constructor(private readonly context: StoreContext) {}

  settings(): AssistantSettings {
    const row = this.context.sql.get(
      STORED_SETTINGS,
      'select settings from assistant_settings where id = 1',
    );
    return row === undefined ? ASSISTANT_SETTINGS.parse({}) : row.settings;
  }

  saveSettings(settings: AssistantSettings): AssistantSettings {
    const parsed = ASSISTANT_SETTINGS.parse(settings);
    this.context.write(() => {
      this.context.sql.run(
        'save the assistant settings',
        `insert into assistant_settings (id, settings, updated_at) values (1, $settings, $now)
         on conflict (id) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { settings: jsonText(parsed), now: this.context.now() },
      );
    });
    return parsed;
  }

  firstText(
    chatId: string,
    role: AssistantMessageRow['role'],
    kind: AssistantMessageRow['kind'],
  ): string | null {
    return (
      this.context.sql.get(
        MESSAGE_TEXT,
        `select text from assistant_messages
         where chat_id = $chat and role = $role and kind = $kind and text <> ''
         order by created_at, rowid limit 1`,
        { chat: chatId, role, kind },
      )?.text ?? null
    );
  }

  message(id: string): AssistantMessageRow {
    return found(
      this.context.sql.get(
        STORED_MESSAGE,
        `select ${MESSAGE_COLUMNS} from assistant_messages where id = $id`,
        { id },
      ),
      'assistant message',
      id,
    );
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

  since(chatId: string, after: string | null): AssistantMessageRow[] {
    return this.context.sql.all(
      STORED_MESSAGE,
      `select ${MESSAGE_COLUMNS} from assistant_messages
       where chat_id = $chat and ($after is null or created_at > $after)
       order by created_at, rowid`,
      { chat: chatId, after },
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

  addMessage(input: NewAssistantMessage): AssistantMessageRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the assistant message',
        `insert into assistant_messages (${MESSAGE_COLUMNS})
         values ($id, $profile, $client, $role, $kind, $author, $text, $attachments, $state,
                 $reason, $steps, $replyTo, $chat, $origin, $embeds, $cost, $model, $now, $now)`,
        {
          id,
          profile: input.profile_id,
          client: input.client_id,
          role: input.role,
          kind: input.kind,
          author: input.author,
          text: input.text,
          attachments: jsonText(input.attachments),
          state: input.state,
          reason: input.reason,
          steps: jsonText(input.steps),
          replyTo: input.reply_to,
          chat: input.chat_id,
          origin: input.origin === null ? null : jsonText(input.origin),
          embeds: jsonText(input.embeds),
          cost: input.cost_micros,
          model: input.model,
          now,
        },
      );
      const row = this.message(id);
      this.context.changed('assistant_messages', 'INSERT', row, null);
      return row;
    });
  }

  updateMessage(id: string, change: AssistantMessageChange): AssistantMessageRow {
    return this.context.write(() => {
      const before = this.message(id);
      const set = assignments({
        state: change.state,
        reason: change.reason,
        text: change.text,
        model: change.model,
        steps: change.steps === undefined ? undefined : jsonText(change.steps),
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

  failWorking(reason: string): void {
    this.context.write(() => {
      const ids = this.context.sql
        .all(
          z.strictObject({ id: z.uuid() }),
          "select id from assistant_messages where role = 'responder' and state = 'working'",
        )
        .map((row) => row.id);
      ids.forEach((id) => {
        this.updateMessage(id, { state: 'failed', reason });
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
         values ($id, null, $profile, $name, $mime, $bytes, $width, $height, $path, $sha, $now)`,
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

export function summaryOf(file: StoredAttachment): AssistantAttachment {
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
  };
}
