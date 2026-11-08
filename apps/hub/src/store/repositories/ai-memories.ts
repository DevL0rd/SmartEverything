import {
  AI_MEMORY_IMPORTANCE,
  AI_MEMORY_KIND,
  AI_MEMORY_SCOPE,
  AI_MEMORY_SETTINGS,
} from '@smarteverything/domain';
import type {
  AiMemoryChange,
  AiMemoryKind,
  AiMemoryScope,
  AiMemorySettings,
  AiMemorySettingsChange,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { flag, SQL_FLAG } from '../sql';

const MEMORY = z.strictObject({
  id: z.uuid(),
  scope: AI_MEMORY_SCOPE,
  profile_id: z.uuid().nullable(),
  text: z.string().min(1),
  source_chat_id: z.uuid().nullable(),
  source_message_id: z.uuid().nullable(),
  kind: AI_MEMORY_KIND,
  importance: AI_MEMORY_IMPORTANCE,
  happened_on: z.string().nullable(),
  valid_until: z.string().nullable(),
  recalled_at: z.string().nullable(),
  recall_count: z.int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
});

const LEARNED = z.strictObject({ through_at: z.string() });

const SETTINGS = z.strictObject({
  enabled: SQL_FLAG,
  prompt_chars: AI_MEMORY_SETTINGS.shape.prompt_chars,
});

const PENDING = z.strictObject({ id: z.uuid(), text: z.string() });

const EMBEDDED = z.strictObject({ id: z.uuid(), embedding: z.instanceof(Uint8Array) });

export type StoredMemory = z.output<typeof MEMORY>;

export interface NewMemory {
  readonly scope: AiMemoryScope;
  readonly text: string;
  readonly sourceChatId: string | null;
  readonly sourceMessageId: string | null;
  readonly kind?: AiMemoryKind;
  readonly importance?: number;
  readonly happenedOn?: string | null;
  readonly validUntil?: string | null;
}

export interface MemoryRating {
  readonly id: string;
  readonly importance: number;
}

export interface MemoryPart {
  readonly text: string;
  readonly kind: AiMemoryKind;
  readonly importance: number;
  readonly happenedOn: string | null;
  readonly validUntil: string | null;
}

const COLUMNS = `id, scope, profile_id, text, source_chat_id, source_message_id, kind, importance,
  happened_on, valid_until, recalled_at, recall_count, created_at, updated_at`;

const REACHABLE = '(profile_id = $profile or profile_id is null)';

const DEFAULT_SETTINGS: AiMemorySettings = { enabled: true, prompt_chars: null };

export class AiMemoriesRepository {
  constructor(private readonly context: StoreContext) {}

  visible(profileId: string): StoredMemory[] {
    return this.context.sql.all(
      MEMORY,
      `select ${COLUMNS} from ai_memories where ${REACHABLE}
       order by updated_at desc, id`,
      { profile: profileId },
    );
  }

  all(): StoredMemory[] {
    return this.context.sql.all(
      MEMORY,
      `select ${COLUMNS} from ai_memories order by created_at, id`,
    );
  }

  find(id: string, profileId: string): StoredMemory | undefined {
    return this.context.sql.get(
      MEMORY,
      `select ${COLUMNS} from ai_memories where id = $id and ${REACHABLE}`,
      { id, profile: profileId },
    );
  }

  add(profileId: string, memory: NewMemory): StoredMemory {
    const now = this.context.now();
    const stored: StoredMemory = {
      id: this.context.newId(),
      scope: memory.scope,
      profile_id: memory.scope === 'person' ? profileId : null,
      text: memory.text,
      source_chat_id: memory.sourceChatId,
      source_message_id: memory.sourceMessageId,
      kind: memory.kind ?? 'fact',
      importance: memory.importance ?? 50,
      happened_on: memory.happenedOn ?? null,
      valid_until: memory.validUntil ?? null,
      recalled_at: null,
      recall_count: 0,
      created_at: now,
      updated_at: now,
    };
    this.context.write(() => {
      this.insert(stored);
    });
    return stored;
  }

  change(id: string, profileId: string, patch: AiMemoryChange): StoredMemory | undefined {
    const current = this.find(id, profileId);
    if (current === undefined) return undefined;
    const text = patch.text ?? current.text;
    this.context.write(() => {
      this.context.sql.run(
        'change one memory',
        `update ai_memories
         set text = $text, kind = $kind, importance = $importance, happened_on = $happened,
             valid_until = $until, updated_at = $now,
             embedding = case when $reembed = 1 then null else embedding end,
             embedding_model = case when $reembed = 1 then null else embedding_model end
         where id = $id and ${REACHABLE}`,
        {
          id,
          profile: profileId,
          text,
          kind: patch.kind ?? current.kind,
          importance: patch.importance ?? current.importance,
          happened: patch.happened_on === undefined ? current.happened_on : patch.happened_on,
          until: patch.valid_until === undefined ? current.valid_until : patch.valid_until,
          reembed: text === current.text ? 0 : 1,
          now: this.context.now(),
        },
      );
    });
    return this.find(id, profileId);
  }

  recalled(ids: readonly string[], now: string): void {
    if (ids.length === 0) return;
    this.context.write(() => {
      for (const id of ids) {
        this.context.sql.run(
          'record that one memory was recalled',
          'update ai_memories set recalled_at = $now, recall_count = recall_count + 1 where id = $id',
          { id, now },
        );
      }
    });
  }

  split(id: string, profileId: string, parts: readonly MemoryPart[]): StoredMemory[] | undefined {
    const current = this.find(id, profileId);
    if (current === undefined || parts.length === 0) return undefined;
    const now = this.context.now();
    const stored = parts.map((part): StoredMemory => ({
      ...current,
      id: this.context.newId(),
      text: part.text,
      kind: part.kind,
      importance: part.importance,
      happened_on: part.happenedOn,
      valid_until: part.validUntil,
      updated_at: now,
    }));
    this.context.write(() => {
      this.context.sql.run('delete one split memory', 'delete from ai_memories where id = $id', {
        id,
      });
      for (const row of stored) this.insert(row);
    });
    return stored;
  }

  expired(today: string): StoredMemory[] {
    return this.context.sql.all(
      MEMORY,
      `select ${COLUMNS} from ai_memories where valid_until is not null and valid_until < $today
       order by valid_until, id`,
      { today },
    );
  }

  learnedThrough(chatId: string): string | undefined {
    return this.context.sql.get(
      LEARNED,
      'select through_at from ai_memory_learning where chat_id = $chat',
      { chat: chatId },
    )?.through_at;
  }

  setLearnedThrough(chatId: string, at: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'record how far the memory manager has learned from one chat',
        `insert into ai_memory_learning (chat_id, through_at) values ($chat, $at)
         on conflict (chat_id) do update set through_at = excluded.through_at`,
        { chat: chatId, at },
      );
    });
  }

  rate(ratings: readonly MemoryRating[]): void {
    if (ratings.length === 0) return;
    this.context.write(() => {
      for (const rating of ratings) {
        this.context.sql.run(
          'rerate one memory without touching its age',
          'update ai_memories set importance = $importance where id = $id',
          { id: rating.id, importance: rating.importance },
        );
      }
    });
  }

  purge(ids: readonly string[]): void {
    if (ids.length === 0) return;
    this.context.write(() => {
      for (const id of ids) {
        this.context.sql.run('purge one faded memory', 'delete from ai_memories where id = $id', {
          id,
        });
      }
    });
  }

  remove(id: string, profileId: string): boolean {
    return (
      this.context.write(() =>
        this.context.sql.run(
          'delete one memory',
          `delete from ai_memories where id = $id and ${REACHABLE}`,
          { id, profile: profileId },
        ),
      ) > 0
    );
  }

  forgetPerson(profileId: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget everything one person asked the AI to remember',
        'delete from ai_memories where profile_id = $profile',
        { profile: profileId },
      ),
    );
  }

  forgetHome(): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget every home memory',
        'delete from ai_memories where profile_id is null',
      ),
    );
  }

  private insert(stored: StoredMemory): void {
    this.context.sql.run(
      'add one memory',
      `insert into ai_memories (${COLUMNS})
       values ($id, $scope, $profile, $text, $chat, $message, $kind, $importance, $happened,
               $until, $recalled, $count, $created, $updated)`,
      {
        id: stored.id,
        scope: stored.scope,
        profile: stored.profile_id,
        text: stored.text,
        chat: stored.source_chat_id,
        message: stored.source_message_id,
        kind: stored.kind,
        importance: stored.importance,
        happened: stored.happened_on,
        until: stored.valid_until,
        recalled: stored.recalled_at,
        count: stored.recall_count,
        created: stored.created_at,
        updated: stored.updated_at,
      },
    );
  }

  unembedded(profileId: string, model: string): { id: string; text: string }[] {
    return this.context.sql.all(
      PENDING,
      `select id, text from ai_memories
       where ${REACHABLE} and (embedding is null or embedding_model is not $model)`,
      { profile: profileId, model },
    );
  }

  setEmbedding(
    memory: Pick<StoredMemory, 'id' | 'text'>,
    model: string,
    vector: Float32Array,
  ): void {
    this.context.write(() => {
      this.context.sql.run(
        'store the embedding of one memory',
        'update ai_memories set embedding = $vector, embedding_model = $model where id = $id and text = $text',
        {
          id: memory.id,
          text: memory.text,
          model,
          vector: new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength),
        },
      );
    });
  }

  embeddings(profileId: string, model: string): Map<string, Float32Array> {
    const rows = this.context.sql.all(
      EMBEDDED,
      `select id, embedding from ai_memories
       where ${REACHABLE} and embedding is not null and embedding_model = $model`,
      { profile: profileId, model },
    );
    return new Map(
      rows.map((row) => [
        row.id,
        new Float32Array(
          row.embedding.buffer.slice(
            row.embedding.byteOffset,
            row.embedding.byteOffset + row.embedding.byteLength,
          ),
        ),
      ]),
    );
  }

  settings(profileId: string): AiMemorySettings {
    return (
      this.context.sql.get(
        SETTINGS,
        'select enabled, prompt_chars from ai_memory_settings where profile_id = $profile',
        { profile: profileId },
      ) ?? DEFAULT_SETTINGS
    );
  }

  changeSettings(profileId: string, change: AiMemorySettingsChange): AiMemorySettings {
    const current = this.settings(profileId);
    const next: AiMemorySettings = {
      enabled: change.enabled ?? current.enabled,
      prompt_chars: change.prompt_chars === undefined ? current.prompt_chars : change.prompt_chars,
    };
    this.context.write(() => {
      this.context.sql.run(
        'save the memory settings of one person',
        `insert into ai_memory_settings (profile_id, enabled, prompt_chars)
         values ($profile, $enabled, $chars)
         on conflict (profile_id) do update
         set enabled = excluded.enabled, prompt_chars = excluded.prompt_chars`,
        { profile: profileId, enabled: flag(next.enabled), chars: next.prompt_chars },
      );
    });
    return next;
  }
}
