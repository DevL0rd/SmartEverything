import {
  AI_CHAT_ROW,
  type AiChatChange,
  type AiChatKind,
  type AiChatRow,
  type Engine,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_CHAT = storedRow(AI_CHAT_ROW, { json: ['engine', 'tools'], flags: ['pinned'] });

const CHAT_COLUMNS =
  'id, profile_id, kind, title, icon, parent_id, source_key, engine, tools, pinned, archived_at, cost_micros, last_message_at, created_at, updated_at';

const TITLE_AUTO = storedRow(z.strictObject({ title_auto: z.boolean() }), {
  flags: ['title_auto'],
});

const CHAT_ID = storedRow(z.strictObject({ id: z.uuid() }), {});

const SETTING = storedRow(z.strictObject({ settings: z.record(z.string(), z.unknown()) }), {
  json: ['settings'],
});

export interface NewChat {
  readonly profileId: string;
  readonly kind: AiChatKind;
  readonly title: string;
  readonly icon: string | null;
  readonly parentId: string | null;
  readonly sourceKey: string | null;
  readonly engine: Engine;
  readonly titleAuto?: boolean;
}

export interface ChatQuery {
  readonly profileId: string;
  readonly archived: boolean;
}

export class AiChatsRepository {
  constructor(private readonly context: StoreContext) {}

  chat(id: string): AiChatRow {
    return found(
      this.context.sql.get(STORED_CHAT, `select ${CHAT_COLUMNS} from ai_chats where id = $id`, {
        id,
      }),
      'AI chat',
      id,
    );
  }

  chats(query: ChatQuery): AiChatRow[] {
    return this.context.sql.all(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats
       where profile_id = $profile and (archived_at is not null) = $archived
       order by pinned desc, coalesce(last_message_at, created_at) desc`,
      { profile: query.profileId, archived: flag(query.archived) },
    );
  }

  activeSince(since: string): AiChatRow[] {
    return this.context.sql.all(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats
       where archived_at is null and coalesce(last_message_at, created_at) >= $since`,
      { since },
    );
  }

  usingEngine(kind: Engine['kind']): AiChatRow[] {
    return this.context.sql.all(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats where json_extract(engine, '$.kind') = $kind`,
      { kind },
    );
  }

  latest(profileId: string, kind: AiChatKind = 'chat'): AiChatRow | undefined {
    return this.context.sql.get(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats
       where profile_id = $profile and kind = $kind and archived_at is null
       order by coalesce(last_message_at, created_at) desc limit 1`,
      { profile: profileId, kind },
    );
  }

  latestWithEngine(profileId: string, kind: Engine['kind']): AiChatRow | undefined {
    return this.context.sql.get(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats
       where profile_id = $profile and json_extract(engine, '$.kind') = $kind and archived_at is null
       order by coalesce(last_message_at, created_at) desc limit 1`,
      { profile: profileId, kind },
    );
  }

  bySource(profileId: string, sourceKey: string): AiChatRow | undefined {
    return this.context.sql.get(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats
       where profile_id = $profile and source_key = $key and archived_at is null
       order by coalesce(last_message_at, created_at) desc limit 1`,
      { profile: profileId, key: sourceKey },
    );
  }

  create(input: NewChat): AiChatRow {
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the AI chat',
        `insert into ai_chats (${CHAT_COLUMNS}, title_auto)
         values ($id, $profile, $kind, $title, $icon, $parent, $source, $engine, null, 0, null, 0,
                 null, $now, $now, $auto)`,
        {
          id,
          profile: input.profileId,
          kind: input.kind,
          title: input.title,
          icon: input.icon,
          parent: input.parentId,
          source: input.sourceKey,
          engine: jsonText(input.engine),
          now,
          auto: flag(input.titleAuto ?? false),
        },
      );
      const row = this.chat(id);
      this.context.changed('ai_chats', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: AiChatChange): AiChatRow {
    return this.context.write(() => {
      const before = this.chat(id);
      const set = assignments({
        title: change.title,
        title_auto: change.title === undefined ? undefined : flag(false),
        icon: change.icon,
        pinned: change.pinned === undefined ? undefined : flag(change.pinned),
        archived_at: archivedAt(change.archived, this.context.now()),
        engine: change.engine === undefined ? undefined : jsonText(change.engine),
        tools:
          change.tools === undefined
            ? undefined
            : change.tools === null
              ? null
              : jsonText(change.tools),
        updated_at: this.context.now(),
      });
      this.context.sql.run('change the AI chat', `update ai_chats set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.chat(id);
      this.context.changed('ai_chats', 'UPDATE', after, before);
      return after;
    });
  }

  titleAuto(id: string): boolean {
    return found(
      this.context.sql.get(TITLE_AUTO, 'select title_auto from ai_chats where id = $id', { id }),
      'AI chat',
      id,
    ).title_auto;
  }

  autoTitle(id: string, title: string): boolean {
    return this.context.write(() => {
      if (!this.titleAuto(id)) {
        return false;
      }
      const before = this.chat(id);
      this.context.sql.run(
        'name the AI chat',
        'update ai_chats set title = $title, title_auto = 0, updated_at = $now where id = $id',
        { id, title, now: this.context.now() },
      );
      this.context.changed('ai_chats', 'UPDATE', this.chat(id), before);
      return true;
    });
  }

  untitled(limit: number): string[] {
    return this.context.sql
      .all(
        CHAT_ID,
        `select id from ai_chats c
         where title_auto = 1 and archived_at is null and (
           exists (select 1 from assistant_messages m
                   where m.chat_id = c.id and m.role = 'system' and m.kind = 'call' and m.text <> '')
           or (exists (select 1 from assistant_messages m where m.chat_id = c.id and m.role = 'person')
               and exists (select 1 from assistant_messages m
                           where m.chat_id = c.id and m.role = 'responder' and m.text <> '')))
         order by coalesce(last_message_at, created_at) desc limit $limit`,
        { limit },
      )
      .map((row) => row.id);
  }

  touched(id: string, costMicros: number): void {
    this.context.write(() => {
      const before = this.chat(id);
      const now = this.context.now();
      this.context.sql.run(
        'note the AI chat’s activity',
        `update ai_chats set last_message_at = $now, cost_micros = cost_micros + $cost, updated_at = $now
         where id = $id`,
        { id, now, cost: Math.max(0, Math.round(costMicros)) },
      );
      this.context.changed('ai_chats', 'UPDATE', this.chat(id), before);
    });
  }

  addCost(id: string, deltaMicros: number): void {
    this.context.write(() => {
      const before = this.chat(id);
      this.context.sql.run(
        'add the cost to the AI chat',
        'update ai_chats set cost_micros = max(0, cost_micros + $delta) where id = $id',
        { id, delta: Math.round(deltaMicros) },
      );
      this.context.changed('ai_chats', 'UPDATE', this.chat(id), before);
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.chat(id);
      this.context.sql.run('remove the AI chat', 'delete from ai_chats where id = $id', { id });
      this.context.changed('ai_chats', 'DELETE', null, before);
    });
  }

  setting(key: string): Readonly<Record<string, unknown>> | null {
    return (
      this.context.sql.get(SETTING, 'select settings from ai_settings where key = $key', { key })
        ?.settings ?? null
    );
  }

  saveSetting(key: string, settings: Readonly<Record<string, unknown>>): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the AI setting',
        `insert into ai_settings (key, settings, updated_at) values ($key, $settings, $now)
         on conflict (key) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { key, settings: jsonText(settings), now: this.context.now() },
      );
    });
  }
}

function archivedAt(archived: boolean | undefined, now: string): string | null | undefined {
  if (archived === undefined) {
    return undefined;
  }
  return archived ? now : null;
}
