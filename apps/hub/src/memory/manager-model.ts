import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import type { StoredMemory } from '../store/repositories/ai-memories';
import {
  MANAGER_SYSTEM,
  REVIEW_SYSTEM,
  managerInput,
  reviewInput,
  type ManagerSubject,
  type ReviewSpread,
} from './manager-prompts';
import {
  MEMORY_REVIEW,
  parseAnswer,
  parseOperations,
  type MemoryOperation,
  type MemoryReviewAnswer,
  type Parsed,
} from './manager-schema';
import type { MemoryPrincipal } from './principal';

const log = new Logger('hub.memory');

export const MEMORY_MANAGER_SESSION = 'memory-manager';

export const MANAGER_ATTEMPTS = 3;

export const MANAGER_WAITS_MS: readonly number[] = [2000, 8000, 30_000];

const RETRY_AFTER = z.object({ retryAfterMs: z.number().positive() });

export interface ManagerCompletion {
  readonly chatId: string;
  readonly model: string;
  readonly system: string;
  readonly input: string;
  readonly sessionKey: string;
}

export interface ManagerModelParts {
  readonly selected: () => string;
  readonly complete: (request: ManagerCompletion) => Promise<string>;
  readonly nameOf: (profileId: string) => string;
  readonly now: () => Date;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface ManagerRequest {
  readonly who: MemoryPrincipal;
  readonly chatId: string;
  readonly memories: readonly StoredMemory[];
  readonly subject: ManagerSubject;
}

export class ManagerFailedError extends Error {
  override readonly name = 'ManagerFailedError';
}

export class ManagerModel {
  constructor(private readonly parts: ManagerModelParts) {}

  modelId(): string {
    return this.parts.selected();
  }

  async propose(
    request: ManagerRequest,
    permitted: () => boolean = () => true,
  ): Promise<readonly MemoryOperation[]> {
    const operations = await this.converse(
      { chatId: request.chatId, system: MANAGER_SYSTEM, input: this.inputOf(request) },
      (raw) => {
        const parsed = parseOperations(raw);
        return parsed.ok ? { ok: true, value: parsed.operations } : parsed;
      },
      permitted,
    );
    return operations ?? [];
  }

  async review(
    chatId: string,
    spread: ReviewSpread,
    memories: readonly StoredMemory[],
    permitted: () => boolean = () => true,
  ): Promise<MemoryReviewAnswer> {
    const answer = await this.converse(
      { chatId, system: REVIEW_SYSTEM, input: reviewInput(this.parts.now(), spread, memories) },
      (raw) => parseAnswer(raw, MEMORY_REVIEW),
      permitted,
    );
    return answer ?? { ratings: [], splits: [] };
  }

  private async converse<T>(
    request: { readonly chatId: string; readonly system: string; readonly input: string },
    read: (raw: string) => Parsed<T>,
    permitted: () => boolean,
  ): Promise<T | null> {
    const model = this.modelId();
    let invalid: string | null = null;
    let failure: unknown = null;
    for (let attempt = 0; attempt < MANAGER_ATTEMPTS; attempt += 1) {
      if (!permitted()) return null;
      try {
        const raw = await this.parts.complete({
          chatId: request.chatId,
          model,
          system: request.system,
          input: invalid === null ? request.input : this.corrected(request.input, invalid),
          sessionKey: MEMORY_MANAGER_SESSION,
        });
        const parsed = read(raw);
        if (parsed.ok) return parsed.value;
        invalid = parsed.reason;
        failure = new ManagerFailedError(parsed.reason);
        continue;
      } catch (cause) {
        failure = cause;
      }
      if (!permitted()) return null;
      if (attempt < MANAGER_ATTEMPTS - 1) await this.parts.sleep(this.wait(attempt, failure));
    }
    if (!permitted()) return null;
    log.error('memory.manager_failed', failure, { attempts: MANAGER_ATTEMPTS });
    throw new ManagerFailedError(`The memory manager failed: ${messageOf(failure)}`);
  }

  async judge(request: ManagerRequest): Promise<readonly MemoryOperation[] | null> {
    const raw = await this.ask(request, this.modelId(), this.inputOf(request));
    const parsed = parseOperations(raw);
    if (!parsed.ok) log.warn('memory.judge_unreadable', { reason: parsed.reason });
    return parsed.ok ? parsed.operations : null;
  }

  private ask(request: ManagerRequest, model: string, input: string): Promise<string> {
    return this.parts.complete({
      chatId: request.chatId,
      model,
      system: MANAGER_SYSTEM,
      input,
      sessionKey: MEMORY_MANAGER_SESSION,
    });
  }

  private today(): string {
    return this.parts.now().toISOString().slice(0, 10);
  }

  private inputOf(request: ManagerRequest): string {
    return managerInput(
      { name: this.parts.nameOf(request.who.profileId), role: request.who.role },
      this.today(),
      request.memories,
      request.subject,
    );
  }

  private corrected(input: string, reason: string): string {
    return `${input}\n\nYour previous answer was rejected: ${reason}\nAnswer again with valid JSON only.`;
  }

  private wait(attempt: number, cause: unknown): number {
    const asked = RETRY_AFTER.safeParse(cause);
    return asked.success ? asked.data.retryAfterMs : (MANAGER_WAITS_MS[attempt] ?? 30_000);
  }
}
