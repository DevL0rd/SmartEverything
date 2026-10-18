import {
  referenceTitles,
  ownsReferenceMessage,
  type ChatReferenceMessage,
  type ChatReferenceTitle,
  type ChatReferenceTitleQuery,
} from './ai-chat-references';
import {
  AI_CHAT_ROW,
  type AiChatChange,
  type AiChatKind,
  type AiChatRow,
  type AiHarnessTarget,
  type Engine,
  type MessageSource,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';
import { UNKNOWN_COST_SQL } from '../../ledger/usage-queries';
import { AFTER_CHAT_SQL, CHAT_MOMENT_SQL, pageParams } from './ai-chat-paging';
import { PENDING_REQUESTS_SQL } from './ai-chat-requests';
import { removeStoredChat } from './ai-chat-removal';
import { subagentChatIds } from './ai-chat-descendants';
import { modelKey, type NewChat } from './ai-chat-input';
import { assertSubagentCreation, holdChatTree, assertChatWork } from './ai-chat-removal-hold';

const STORED_CHAT = storedRow(AI_CHAT_ROW, {
  json: ['engine', 'tools', 'origin', 'pending_execution_target'],
  flags: ['pinned', 'cost_incomplete'],
});

const STORED_COLUMNS =
  'id, profile_id, kind, title, icon, parent_id, source_key, engine, tools, pinned, archived_at, cost_micros, read_at, context_percent, branch_message_id, last_message_at, created_at, updated_at';

const INCOMING_SQL = `((m.role = 'responder' and m.kind in ('text', 'update') and m.state is not 'working')
  or (m.role = 'person' and json_extract(m.origin, '$.source') not in ('app', 'voice')
      and not (json_extract(m.origin, '$.source') = 'plugin'
               and coalesce(json_extract(m.origin, '$.requester'), '') = 'owner')))`;

const CHAT_COLUMNS = `${STORED_COLUMNS}, pending_execution_target, deletion_state, deletion_error,
  exists(select 1 from ai_usage where chat_id = ai_chats.id and ${UNKNOWN_COST_SQL}) as cost_incomplete,
  (select m.origin from assistant_messages m
   where m.chat_id = ai_chats.id and m.origin is not null
   order by m.created_at, m.rowid limit 1) as origin,
  (select count(*) from assistant_messages m
   where m.chat_id = ai_chats.id and (ai_chats.read_at is null or m.created_at > ai_chats.read_at)
     and ${INCOMING_SQL}) as unread_count,
  ${PENDING_REQUESTS_SQL} as pending_requests`;

const TITLE_AUTO = storedRow(z.strictObject({ title_auto: z.boolean() }), {
  flags: ['title_auto'],
});

const CHAT_ID = storedRow(z.strictObject({ id: z.uuid() }), {});

export type { NewChat } from './ai-chat-input';

export interface ChatQuery {
  readonly profileId: string;
  readonly archived: boolean;
  readonly unread?: boolean | undefined;
  readonly pinned?: boolean | undefined;
  readonly source?: MessageSource | undefined;
  readonly before?: string | undefined;
  readonly limit?: number | undefined;
}

export interface TitleHit {
  readonly id: string;
  readonly title: string;
  readonly at: string;
  readonly archived: boolean;
}

export class NothingToMarkUnreadError extends Error {
  override readonly name = 'NothingToMarkUnreadError';

  constructor(readonly chatId: string) {
    super(`The chat ${chatId} has no incoming message to mark unread.`);
  }
}

const TITLE_HIT = storedRow(
  z.strictObject({
    id: z.uuid(),
    title: z.string(),
    at: z.iso.datetime({ offset: true }),
    archived: z.boolean(),
  }),
  { flags: ['archived'] },
);

const MOMENT_ROW = storedRow(
  z.strictObject({ at: z.iso.datetime({ offset: true }).nullable() }),
  {},
);

export class AiChatsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): AiChatRow | undefined {
    return this.context.sql.get(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats where id = $id`,
      {
        id,
      },
    );
  }

  chat(id: string): AiChatRow {
    return found(this.find(id), 'AI chat', id);
  }

  chats(query: ChatQuery): AiChatRow[] {
    const after = query.before === undefined ? undefined : this.chat(query.before);
    return this.context.sql.all(
      STORED_CHAT,
      `select ${CHAT_COLUMNS} from ai_chats
       where profile_id = $profile and (archived_at is not null) = $archived
         and ($unread is null or (unread_count > 0) = $unread)
         and ($pinned is null or pinned = $pinned)
         and ($source is null or coalesce(json_extract(origin, '$.source'), 'app') = $source)
         and ${AFTER_CHAT_SQL}
       order by pinned desc, ${CHAT_MOMENT_SQL} desc, id
       limit $limit`,
      {
        profile: query.profileId,
        archived: flag(query.archived),
        unread: query.unread === undefined ? null : flag(query.unread),
        pinned: query.pinned === undefined ? null : flag(query.pinned),
        source: query.source ?? null,
        ...pageParams(after, query.limit),
      },
    );
  }

  titleHits(query: {
    readonly profileId: string;
    readonly text: string;
    readonly archived: boolean;
    readonly limit: number;
  }): TitleHit[] {
    return this.context.sql.all(
      TITLE_HIT,
      `select id, title, coalesce(last_message_at, created_at) as at,
              (archived_at is not null) as archived
       from ai_chats
       where profile_id = $profile and instr(lower(title), lower($text)) > 0
         and ($archived = 1 or archived_at is null)
       order by at desc, id limit $limit`,
      {
        profile: query.profileId,
        text: query.text,
        archived: flag(query.archived),
        limit: query.limit,
      },
    );
  }

  referenceTitles(query: ChatReferenceTitleQuery): ChatReferenceTitle[] {
    return referenceTitles(this.context, query);
  }

  ownsReferenceMessage(query: ChatReferenceMessage): boolean {
    return ownsReferenceMessage(this.context, query);
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
    assertSubagentCreation(this.context, input);
    return this.context.write(() => {
      const id = this.context.newId();
      const now = this.context.now();
      this.context.sql.run(
        'add the AI chat',
        `insert into ai_chats (${STORED_COLUMNS}, title_auto)
         values ($id, $profile, $kind, $title, $icon, $parent, $source, $engine, $tools, 0, null, 0,
                 null, null, $branch, null, $now, $now, $auto)`,
        {
          id,
          profile: input.profileId,
          kind: input.kind,
          title: input.title,
          icon: input.icon,
          parent: input.parentId,
          source: input.sourceKey,
          engine: jsonText(input.engine),
          tools: input.tools === undefined || input.tools === null ? null : jsonText(input.tools),
          branch: input.branchMessageId ?? null,
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
        context_percent:
          change.engine !== undefined && modelKey(change.engine) !== modelKey(before.engine)
            ? null
            : undefined,
        updated_at: this.context.now(),
      });
      this.context.sql.run('change the AI chat', `update ai_chats set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      if (change.read !== undefined) {
        this.setRead(id, change.read);
      }
      const after = this.chat(id);
      this.context.changed('ai_chats', 'UPDATE', after, before);
      return after;
    });
  }

  private setRead(id: string, read: boolean): void {
    if (read) {
      this.context.sql.run(
        'mark the AI chat read',
        `update ai_chats set read_at = max($now,
           coalesce((select max(created_at) from assistant_messages where chat_id = $id), $now))
         where id = $id`,
        { id, now: this.context.now() },
      );
      return;
    }
    const latest = this.context.sql.get(
      MOMENT_ROW,
      `select max(m.created_at) as at from assistant_messages m
       where m.chat_id = $id and ${INCOMING_SQL}`,
      { id },
    )?.at;
    if (latest === null || latest === undefined) {
      throw new NothingToMarkUnreadError(id);
    }
    this.context.sql.run(
      'mark the AI chat unread',
      `update ai_chats set read_at = (
         select max(created_at) from assistant_messages where chat_id = $id and created_at < $latest)
       where id = $id`,
      { id, latest },
    );
  }

  setPendingTarget(id: string, target: AiHarnessTarget | null): void {
    this.context.write(() => {
      const before = this.chat(id);
      this.context.sql.run(
        'record the machine the AI chat moves to',
        'update ai_chats set pending_execution_target = $target where id = $id',
        { id, target: target === null ? null : jsonText(target) },
      );
      this.context.changed('ai_chats', 'UPDATE', this.chat(id), before);
    });
  }

  noteContext(id: string, percent: number | null): void {
    this.context.write(() => {
      const before = this.chat(id);
      if (before.context_percent === percent) {
        return;
      }
      this.context.sql.run(
        'note how full the AI chat is',
        'update ai_chats set context_percent = $percent where id = $id',
        { id, percent },
      );
      this.context.changed('ai_chats', 'UPDATE', this.chat(id), before);
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

  deletion(ids: readonly string[], state: 'deleting' | 'failed', error: string | null): void {
    this.context.write(() => {
      for (const id of ids) {
        const before = this.chat(id);
        this.context.sql.run(
          'record synchronous chat deletion state',
          'update ai_chats set deletion_state=$state,deletion_error=$error where id=$id',
          { id, state, error },
        );
        this.context.changed('ai_chats', 'UPDATE', this.chat(id), before);
      }
    });
  }
  assertWorkAllowed(id: string): void {
    assertChatWork(this.context, id);
  }
  holdRemoval(ids: readonly string[], work: () => Promise<void>): Promise<void> {
    return holdChatTree(this.context, ids, work);
  }
  removalIds(id: string): string[] {
    return subagentChatIds(this.context, id);
  }
  remove(id: string): void {
    removeStoredChat(this.context, this.chat(id), (chatId) => this.chat(chatId));
  }
}

function archivedAt(archived: boolean | undefined, now: string): string | null | undefined {
  if (archived === undefined) {
    return undefined;
  }
  return archived ? now : null;
}
