import type {
  AiMemory,
  AiMemoryAdd,
  AiMemoryChange,
  AiMemoryLine,
  AiMemoryList,
  AiMemoryOutcome,
  AiMemoryRecall,
  AiMemoryScope,
  AiMemoryToolLine,
  AiMemorySettings,
  AiMemorySettingsChange,
} from '@smarteverything/domain';
import { memorySaved } from '@smarteverything/domain';
import type { AiMemoriesRepository, StoredMemory } from '../store/repositories/ai-memories';
import type { AiChatsRepository } from '../store/repositories/ai-chats';
import { Logger } from '@smarteverything/logging';
import type { MemoryEmbedder } from './embedder';
import type { MemoryPrincipal } from './principal';
import {
  DEFAULT_PROMPT_CHARS,
  NEVER_FADES,
  expired,
  faded,
  RECENT_COUNT,
  RELEVANT_COUNT,
  WINDOW_COUNT,
  WINDOWS,
  localDay,
  memoryCalendar,
  rank,
  rankRelevant,
  strength,
} from './search';
import { MemoryWriter, requireScope, type MemoryJudge } from './writer';

const log = new Logger('hub.memory');

export function lineOf(memory: AiMemoryLine): AiMemoryLine {
  return {
    id: memory.id,
    scope: memory.scope,
    text: memory.text,
    kind: memory.kind,
    importance: memory.importance,
    happened_on: memory.happened_on,
    valid_until: memory.valid_until,
    updated_at: memory.updated_at,
  };
}

export interface AddedMemory {
  readonly memory: AiMemory;
  readonly outcome: AiMemoryOutcome;
}

export interface LatestMessage {
  readonly id: string;
  readonly text: string;
}

interface Relevance {
  readonly messageId: string;
  readonly ids: readonly string[];
}

const EMPTY_RECALL = {
  core: [],
  vocabulary: [],
  relevant: [],
  recent: [],
  today: [],
  week: [],
  month: [],
  year: [],
  faded: 0,
};

export interface MemoryServicePorts {
  readonly judge: MemoryJudge | null;
  readonly zone: () => string;
  readonly now: () => Date;
}

export class MemoryService {
  readonly writer: MemoryWriter;
  private readonly zone: () => string;
  private readonly now: () => Date;
  private readonly relevance = new Map<string, Relevance>();

  constructor(
    private readonly memories: AiMemoriesRepository,
    private readonly chats: Pick<AiChatsRepository, 'find' | 'latest'>,
    private readonly embedder: MemoryEmbedder,
    ports: MemoryServicePorts = {
      judge: null,
      zone: (): string => 'UTC',
      now: (): Date => new Date(),
    },
  ) {
    this.zone = ports.zone;
    this.now = ports.now;
    this.writer = new MemoryWriter(memories, chats, embedder, ports.judge);
  }

  list(who: MemoryPrincipal): AiMemoryList {
    return {
      settings: this.memories.settings(who.profileId),
      memories: this.memories.visible(who.profileId).map((memory) => this.shown(who, memory)),
    };
  }

  toolLine(memory: AiMemoryLine): AiMemoryToolLine {
    const { updated_at, ...rest } = lineOf(memory);
    return { ...rest, saved: memorySaved(updated_at, this.now(), this.zone()) };
  }

  async add(who: MemoryPrincipal, input: AiMemoryAdd): Promise<AddedMemory> {
    const written = await this.writer.add(who, input, { judge: true });
    return { memory: this.shown(who, written.memory), outcome: written.outcome };
  }

  async search(
    who: MemoryPrincipal,
    query: string,
    scope: AiMemoryScope | undefined,
  ): Promise<AiMemoryLine[]> {
    const found = await this.embedWithQuery(who, query, 'memory.query_embedding_failed');
    const visible = this.memories
      .visible(who.profileId)
      .filter((memory) => scope === undefined || memory.scope === scope);
    const ranked = rank(
      visible,
      query,
      found,
      this.memories.embeddings(who.profileId, this.embedder.model),
    );
    this.memories.recalled(
      ranked.map((memory) => memory.id),
      new Date().toISOString(),
    );
    return ranked.map(lineOf);
  }

  change(
    who: MemoryPrincipal,
    id: string,
    patch: AiMemoryChange,
  ): { readonly memory: AiMemory; readonly outcome: AiMemoryOutcome } {
    const written = this.writer.change(who, id, patch);
    return { memory: this.shown(who, written.memory), outcome: written.outcome };
  }

  remove(who: MemoryPrincipal, id: string): void {
    this.writer.remove(who, id);
  }

  forget(who: MemoryPrincipal, scope: AiMemoryScope): number {
    requireScope(who, scope);
    return scope === 'home'
      ? this.memories.forgetHome()
      : this.memories.forgetPerson(who.profileId);
  }

  settings(who: MemoryPrincipal): AiMemorySettings {
    return this.memories.settings(who.profileId);
  }

  changeSettings(who: MemoryPrincipal, change: AiMemorySettingsChange): AiMemorySettings {
    return this.memories.changeSettings(who.profileId, change);
  }

  offered(who: MemoryPrincipal): boolean {
    return this.memories.settings(who.profileId).enabled && this.chatAllows(who);
  }

  async prepare(who: MemoryPrincipal, latest: LatestMessage | null): Promise<void> {
    const permitted = (): boolean => this.offered(who);
    if (latest === null || who.chatId === null || !permitted()) return;
    if (this.relevance.get(who.chatId)?.messageId === latest.id) return;
    const query = latest.text.trim();
    if (query === '') {
      this.relevance.set(who.chatId, { messageId: latest.id, ids: [] });
      return;
    }
    const vector = await this.embedWithQuery(who, query, 'memory.relevance_failed', permitted);
    if (!permitted() || this.relevance.get(who.chatId)?.messageId === latest.id) return;
    const now = new Date();
    const day = localDay(now, this.zone());
    const visible = this.memories.visible(who.profileId).filter((memory) => !expired(memory, day));
    const ranked = rankRelevant(
      visible,
      query,
      vector,
      this.memories.embeddings(who.profileId, this.embedder.model),
    ).slice(0, RELEVANT_COUNT);
    const ids = ranked.map((memory) => memory.id);
    this.memories.recalled(ids, now.toISOString());
    this.relevance.set(who.chatId, { messageId: latest.id, ids });
  }

  recall(who: MemoryPrincipal): AiMemoryRecall {
    const prompt_chars = this.memories.settings(who.profileId).prompt_chars ?? DEFAULT_PROMPT_CHARS;
    const time_zone = this.zone();
    if (!this.offered(who)) return { ...EMPTY_RECALL, prompt_chars, time_zone };
    const visible = this.memories.visible(who.profileId);
    const chosen = new Set(this.relevance.get(who.chatId ?? '')?.ids ?? []);
    return { prompt_chars, time_zone, ...this.sections(visible, chosen, this.now()) };
  }

  private sections(
    visible: readonly StoredMemory[],
    chosen: ReadonlySet<string>,
    now: Date,
  ): Omit<AiMemoryRecall, 'prompt_chars' | 'time_zone'> {
    const placed = new Set<string>();
    const take = (found: readonly StoredMemory[]): AiMemoryLine[] => {
      found.forEach((memory) => placed.add(memory.id));
      return found.map(lineOf);
    };
    const { day, daysAgo } = memoryCalendar(now, this.zone());
    const current = visible.filter((memory) => !expired(memory, day));
    const open = (): StoredMemory[] => current.filter((memory) => !placed.has(memory.id));
    const vocabulary = take(current.filter((memory) => memory.kind === 'vocabulary'));
    const core = take(open().filter((memory) => memory.importance >= NEVER_FADES));
    const relevant = take(open().filter((memory) => chosen.has(memory.id)));
    const alive = open().filter((memory) => !faded(memory, now, day));
    const recent = take(alive.slice(0, RECENT_COUNT));
    const ranked = alive
      .slice(RECENT_COUNT)
      .map((memory) => ({ memory, age: daysAgo(memory), score: strength(memory, now) }))
      .toSorted((a, b) => b.score - a.score);
    const windowed = (days: number): AiMemoryLine[] =>
      take(
        ranked
          .filter(({ memory, age }) => !placed.has(memory.id) && age < days)
          .slice(0, WINDOW_COUNT)
          .map(({ memory }) => memory),
      );
    const [today, week, month, year] = WINDOWS.map((window) => windowed(window.days));
    return {
      core,
      vocabulary,
      relevant,
      recent,
      today: today ?? [],
      week: week ?? [],
      month: month ?? [],
      year: year ?? [],
      faded: visible.length - placed.size,
    };
  }

  private chatAllows(who: MemoryPrincipal): boolean {
    return who.chatId === null || this.chats.find(who.chatId)?.memory === true;
  }

  private async embedWithQuery(
    who: MemoryPrincipal,
    query: string,
    event: string,
    permitted?: () => boolean,
  ): Promise<Float32Array | null> {
    try {
      return await this.writer.embedOne(who, query, permitted);
    } catch (cause) {
      log.exception(event, cause);
      return null;
    }
  }

  private shown(who: MemoryPrincipal, memory: StoredMemory): AiMemory {
    const withSource = memory.scope === 'person' || who.role === 'owner';
    return {
      id: memory.id,
      scope: memory.scope,
      text: memory.text,
      source_chat_id: withSource ? memory.source_chat_id : null,
      source_message_id: withSource ? memory.source_message_id : null,
      kind: memory.kind,
      importance: memory.importance,
      happened_on: memory.happened_on,
      valid_until: memory.valid_until,
      recalled_at: memory.recalled_at,
      recall_count: memory.recall_count,
      created_at: memory.created_at,
      updated_at: memory.updated_at,
    };
  }
}
