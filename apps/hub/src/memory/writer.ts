import { ApiError } from '@smarteverything/domain';
import type {
  AiMemoryAdd,
  AiMemoryChange,
  AiMemoryOutcome,
  AiMemoryScope,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { AiChatsRepository } from '../store/repositories/ai-chats';
import type { AiMemoriesRepository, StoredMemory } from '../store/repositories/ai-memories';
import type { MemoryEmbedder } from './embedder';
import type { ManagerRequest } from './manager-model';
import type { MemoryOperation, MemorySplit } from './manager-schema';
import type { MemoryPrincipal } from './principal';
import { cosine, DEDUPE_NEIGHBOURS, DUPLICATE_SIMILARITY, NEIGHBOUR_SIMILARITY } from './search';

const log = new Logger('hub.memory');

export interface MemoryJudge {
  readonly judge: (request: ManagerRequest) => Promise<readonly MemoryOperation[] | null>;
}

export interface Written {
  readonly memory: StoredMemory;
  readonly outcome: AiMemoryOutcome;
}

export interface AppliedOperation {
  readonly op: MemoryOperation['op'];
  readonly memory: StoredMemory | null;
  readonly outcome: AiMemoryOutcome | 'deleted';
}

export interface Neighbour {
  readonly memory: StoredMemory;
  readonly similarity: number;
}

export function absent(id: string): ApiError {
  return new ApiError('not_found', `There is no memory ${id} for you.`);
}

export function requireScope(who: MemoryPrincipal, scope: AiMemoryScope): void {
  if (scope === 'home' && who.role !== 'owner')
    throw new ApiError('forbidden', 'Only an owner can change what the whole home remembers.');
}

function normalised(text: string): string {
  return text.trim().replace(/\s+/gu, ' ').toLowerCase();
}

function requirePermission(permitted: (() => boolean) | undefined): void {
  if (permitted?.() === false)
    throw new ApiError('forbidden', 'Automatic memory writing is no longer allowed.');
}

export class MemoryWriter {
  constructor(
    private readonly memories: AiMemoriesRepository,
    private readonly chats: Pick<AiChatsRepository, 'latest'>,
    private readonly embedder: MemoryEmbedder,
    private readonly judge: MemoryJudge | null,
  ) {}

  async add(
    who: MemoryPrincipal,
    input: AiMemoryAdd,
    options: { readonly judge: boolean; readonly permitted?: (() => boolean) | undefined },
  ): Promise<Written> {
    requirePermission(options.permitted);
    requireScope(who, input.scope);
    const inScope = this.memories.visible(who.profileId).filter((m) => m.scope === input.scope);
    const key = normalised(input.text);
    const same = inScope.find((memory) => normalised(memory.text) === key);
    if (same !== undefined) return this.unchanged(who, same, input);
    let vector: Float32Array | null = null;
    let near: readonly Neighbour[] = [];
    try {
      vector = await this.embedOne(who, input.text, options.permitted);
      if (vector !== null)
        near = this.near(who, inScope, vector, NEIGHBOUR_SIMILARITY).slice(0, DEDUPE_NEIGHBOURS);
    } catch (cause) {
      log.exception('memory.dedupe_unavailable', cause);
    }
    requirePermission(options.permitted);
    const top = near[0];
    if (top !== undefined && top.similarity >= DUPLICATE_SIMILARITY)
      return this.unchanged(who, top.memory, input);
    if (top !== undefined && options.judge) {
      const judged = await this.judged(who, input, near);
      if (judged !== null) return judged;
    }
    return this.insert(who, input, vector);
  }

  change(who: MemoryPrincipal, id: string, patch: AiMemoryChange): Written {
    const current = this.reachable(who, id);
    requireScope(who, current.scope);
    if (this.same(current, patch)) return { memory: current, outcome: 'unchanged' };
    const changed = this.memories.change(id, who.profileId, patch);
    if (changed === undefined) throw absent(id);
    this.embedInBackground(who.profileId);
    return { memory: changed, outcome: 'merged' };
  }

  split(who: MemoryPrincipal, id: string, parts: MemorySplit['parts']): readonly StoredMemory[] {
    requireScope(who, this.reachable(who, id).scope);
    const stored = this.memories.split(
      id,
      who.profileId,
      parts.map((part) => ({
        text: part.text,
        kind: part.kind,
        importance: part.significance,
        happenedOn: part.happened_on,
        validUntil: part.valid_until,
      })),
    );
    if (stored === undefined) throw absent(id);
    this.embedInBackground(who.profileId);
    return stored;
  }

  remove(who: MemoryPrincipal, id: string): void {
    requireScope(who, this.reachable(who, id).scope);
    if (!this.memories.remove(id, who.profileId)) throw absent(id);
  }

  reachable(who: MemoryPrincipal, id: string): StoredMemory {
    const memory = this.memories.find(id, who.profileId);
    if (memory === undefined) throw absent(id);
    return memory;
  }

  async fill(profileId: string, permitted?: () => boolean): Promise<void> {
    const pending = this.memories.unembedded(profileId, this.embedder.model);
    if (pending.length === 0) return;
    const vectors = await this.embedder.embed(pending.map((memory) => memory.text));
    if (permitted?.() === false) return;
    pending.forEach((memory, index) => {
      const vector = vectors[index];
      if (vector !== undefined) this.memories.setEmbedding(memory, this.embedder.model, vector);
    });
  }

  async embedOne(
    who: MemoryPrincipal,
    text: string,
    permitted?: () => boolean,
  ): Promise<Float32Array | null> {
    if (permitted?.() === false) return null;
    await this.fill(who.profileId, permitted);
    if (permitted?.() === false) return null;
    const [vector] = await this.embedder.embed([text]);
    if (vector === undefined) throw new Error('The embedder returned no vector.');
    return vector;
  }

  async similar(
    who: MemoryPrincipal,
    text: string,
    limit: number,
    permitted: () => boolean,
  ): Promise<readonly Neighbour[]> {
    const vector = await this.embedOne(who, text, permitted);
    if (vector === null) return [];
    return this.near(who, this.memories.visible(who.profileId), vector, 0).slice(0, limit);
  }

  async apply(
    who: MemoryPrincipal,
    operations: readonly MemoryOperation[],
    allowed: ReadonlySet<string>,
    permitted?: () => boolean,
  ): Promise<readonly AppliedOperation[]> {
    const applied: AppliedOperation[] = [];
    for (const operation of operations) {
      if (permitted?.() === false) break;
      try {
        const result = await this.applyOne(who, operation, allowed, permitted);
        if (result !== null) applied.push(result);
      } catch (cause) {
        if (!(cause instanceof ApiError)) throw cause;
        log.warn('memory.operation_rejected', { op: operation.op, reason: cause.message });
      }
    }
    return applied;
  }

  embedInBackground(profileId: string): void {
    this.fill(profileId).catch((cause: unknown) => {
      log.exception('memory.embedding_failed', cause);
    });
  }

  private async applyOne(
    who: MemoryPrincipal,
    operation: MemoryOperation,
    allowed: ReadonlySet<string>,
    permitted: (() => boolean) | undefined,
  ): Promise<AppliedOperation | null> {
    if (operation.op === 'add') {
      const scope = operation.scope === 'home' && who.role !== 'owner' ? 'person' : operation.scope;
      const written = await this.add(
        who,
        {
          scope,
          text: operation.text,
          kind: operation.kind,
          importance: operation.significance,
          happened_on: operation.happened_on,
          valid_until: operation.valid_until,
        },
        { judge: false, permitted },
      );
      return { op: 'add', memory: written.memory, outcome: written.outcome };
    }
    if (!allowed.has(operation.id)) {
      log.warn('memory.operation_ignored', { op: operation.op, reason: 'unknown_id' });
      return null;
    }
    if (operation.op === 'delete') {
      this.remove(who, operation.id);
      return { op: 'delete', memory: null, outcome: 'deleted' };
    }
    const written = this.change(who, operation.id, {
      text: operation.text,
      kind: operation.kind,
      importance: operation.significance,
      happened_on: operation.happened_on,
      valid_until: operation.valid_until,
    });
    return { op: 'update', memory: written.memory, outcome: written.outcome };
  }

  private async judged(
    who: MemoryPrincipal,
    input: AiMemoryAdd,
    near: readonly Neighbour[],
  ): Promise<Written | null> {
    const operations = await this.ruling(who, input, near);
    if (operations === null) return null;
    if (operations.length === 0) return this.unchanged(who, near[0]?.memory, input);
    const applied = await this.apply(who, operations, new Set(near.map((e) => e.memory.id)));
    const kept = applied.find((entry) => entry.memory !== null && entry.op !== 'delete');
    if (kept?.memory === null || kept === undefined) return null;
    return { memory: kept.memory, outcome: kept.outcome === 'added' ? 'added' : 'merged' };
  }

  private async ruling(
    who: MemoryPrincipal,
    input: AiMemoryAdd,
    near: readonly Neighbour[],
  ): Promise<readonly MemoryOperation[] | null> {
    const chatId = who.chatId ?? this.chats.latest(who.profileId)?.id;
    if (this.judge === null || chatId === undefined) return null;
    try {
      return await this.judge.judge({
        who,
        chatId,
        memories: near.map((entry) => entry.memory),
        subject: { kind: 'candidate', text: input.text },
      });
    } catch (cause) {
      log.exception('memory.dedupe_unavailable', cause);
      return null;
    }
  }

  private unchanged(
    who: MemoryPrincipal,
    existing: StoredMemory | undefined,
    input: AiMemoryAdd,
  ): Written {
    if (existing === undefined) throw new Error('A duplicate was reported without a note.');
    const raised = input.importance !== undefined && input.importance > existing.importance;
    const memory = raised
      ? (this.memories.change(existing.id, who.profileId, { importance: input.importance }) ??
        existing)
      : existing;
    return { memory, outcome: 'unchanged' };
  }

  private insert(who: MemoryPrincipal, input: AiMemoryAdd, vector: Float32Array | null): Written {
    const memory = this.memories.add(who.profileId, {
      scope: input.scope,
      text: input.text,
      kind: input.kind ?? 'fact',
      importance: input.importance ?? 50,
      happenedOn: input.happened_on ?? null,
      validUntil: input.valid_until ?? null,
      sourceChatId: who.chatId,
      sourceMessageId: who.messageId,
    });
    if (vector === null) this.embedInBackground(who.profileId);
    else this.memories.setEmbedding(memory, this.embedder.model, vector);
    return { memory, outcome: 'added' };
  }

  private near(
    who: MemoryPrincipal,
    rows: readonly StoredMemory[],
    vector: Float32Array,
    minimum: number,
  ): Neighbour[] {
    const vectors = this.memories.embeddings(who.profileId, this.embedder.model);
    const found: Neighbour[] = [];
    for (const memory of rows) {
      const stored = vectors.get(memory.id);
      const similarity = stored === undefined ? 0 : cosine(vector, stored);
      if (similarity > 0 && similarity >= minimum) found.push({ memory, similarity });
    }
    return found.toSorted((a, b) => b.similarity - a.similarity);
  }

  private same(current: StoredMemory, patch: AiMemoryChange): boolean {
    return (
      (patch.text === undefined || patch.text === current.text) &&
      (patch.kind === undefined || patch.kind === current.kind) &&
      (patch.importance === undefined || patch.importance === current.importance) &&
      (patch.happened_on === undefined || patch.happened_on === current.happened_on) &&
      (patch.valid_until === undefined || patch.valid_until === current.valid_until)
    );
  }
}
