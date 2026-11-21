import { ApiError, type AiChatRow, type AssistantReasonCode } from '@smarteverything/domain';
import { isModelUnavailable } from '../harness/model-unavailable';
import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { ConversationAuthority } from '../harness/authority-contract';
import { withExecutionAuthority } from './turn-authority';
import { DeliveryTrace, eventFields } from './delivery-trace';
import type { Engine } from './engines/engine';
import { background, messageOf } from '@smarteverything/logging';

export const DELIVERY_RETRY_MS = 2000;

export type Routing =
  | {
      readonly kind: 'engine';
      readonly engine: Engine;
      readonly chat: AiChatRow;
      readonly authority?: ConversationAuthority;
    }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'blocked'; readonly reason: string };

export interface DeliveryEvents {
  readonly pending: () => Promise<StoredEvent[]>;
  readonly mark: (id: string, column: 'delivered_at' | 'answered_at') => Promise<void>;
}

export function hostedDeliveryEvents(store: Pick<Store, 'host'>): DeliveryEvents {
  return {
    pending: () => store.host.call('assistantEvents', 'pending'),
    mark: (id, column) => store.host.call('assistantEvents', 'mark', id, column),
  };
}

export interface DeliveryOptions {
  readonly events: DeliveryEvents;
  readonly frozen?: (chatId: string) => Promise<boolean>;
  readonly admit?: (event: StoredEvent) => Promise<boolean>;
  readonly route: (event: StoredEvent) => Promise<Routing>;
  readonly delivered: (event: StoredEvent) => void;
  readonly failed: (event: StoredEvent, reason: string, code: AssistantReasonCode) => void;
  readonly retrying: (event: StoredEvent, active: boolean) => void;
  readonly stopped: (event: StoredEvent) => void;
  readonly log: Logger;
}

export class AssistantDelivery {
  private stopped = false;
  private readonly busy = new Set<string>();
  private readonly unsteerableChats = new Set<string>();
  private readonly steering = new Set<string>();
  private readonly unsteerable = new Set<string>();
  private readonly suspended = new Map<string, Promise<void>>();
  private readonly removed = new Set<string>();
  private readonly waits = new Map<string, () => void>();
  private readonly halted = new Set<string>();
  readonly blocked = new Map<string, string>();
  private readonly admissions = new Set<(event: StoredEvent) => boolean>();
  private readonly taken = new Set<string>();
  private again = false;
  private running: Promise<void> | null = null;

  constructor(private readonly options: DeliveryOptions) {}

  added(): void {
    this.pump();
  }

  admission(admit: (event: StoredEvent) => boolean): () => void {
    this.admissions.add(admit);
    return (): void => {
      this.admissions.delete(admit);
    };
  }

  pump(): void {
    if (this.stopped) return;
    this.again = true;
    if (this.running !== null) return;
    const run = this.drain().finally(() => {
      this.running = null;
    });
    this.running = run;
    background(run, 'delivery.pump_failed');
  }

  async settled(): Promise<void> {
    while (this.running !== null) await this.running;
  }

  private async drain(): Promise<void> {
    while (this.again && !this.stopped) {
      this.again = false;
      const pending = await this.options.events.pending();
      const ids = new Set(pending.map((event) => event.id));
      for (const id of this.taken) if (!ids.has(id)) this.taken.delete(id);
      this.options.log.trace('assistant.pump_ran', {
        pending: pending.length,
        busy: this.busy.size,
        suspended: this.suspended.size,
      });
      for (const event of pending) {
        if (this.isStopped()) return;
        if (!this.taken.has(event.id)) await this.consider(event);
      }
    }
  }

  private isStopped(): boolean {
    return this.stopped;
  }

  private async consider(event: StoredEvent): Promise<void> {
    if (await this.steerable(event)) {
      await this.steer(event);
      return;
    }
    if (await this.frozen(event.chat_id)) {
      this.options.log.trace('assistant.delivery_deferred', () => ({
        ...eventFields(event),
        busy: this.busy.has(event.chat_id),
        suspended: this.suspended.has(event.chat_id),
      }));
      return;
    }
    if (!(await this.admitted(event))) return;
    const routing = await this.options.route(event);
    if (routing.kind === 'waiting') {
      this.options.log.debug('assistant.delivery_waiting', () => eventFields(event));
    } else if (routing.kind === 'blocked') {
      this.options.log.info('assistant.delivery_blocked', {
        ...eventFields(event),
        reason: routing.reason,
      });
      await this.give(event, routing.reason, 'unknown');
    } else if ((await this.options.admit?.(event)) !== false) this.start(event, routing);
    else this.options.log.debug('assistant.delivery_held', () => eventFields(event));
  }

  private async answer(id: string): Promise<void> {
    this.taken.add(id);
    await this.options.events.mark(id, 'answered_at');
  }

  private async steerable(event: StoredEvent): Promise<boolean> {
    return (
      this.busy.has(event.chat_id) &&
      !this.unsteerableChats.has(event.chat_id) &&
      !this.suspended.has(event.chat_id) &&
      !this.steering.has(event.id) &&
      !this.unsteerable.has(event.id) &&
      (await this.options.frozen?.(event.chat_id)) !== true
    );
  }

  private async steer(event: StoredEvent): Promise<void> {
    const routing = await this.options.route(event);
    if (routing.kind === 'waiting') return;
    const steer =
      routing.kind === 'engine' && routing.authority?.repair_origin === undefined
        ? routing.engine.steer
        : undefined;
    if (routing.kind !== 'engine' || steer === undefined) {
      this.unsteerable.add(event.id);
      this.options.log.debug('assistant.steer_unsupported', () => ({
        ...eventFields(event),
        routing: routing.kind,
      }));
      return;
    }
    this.steering.add(event.id);
    const startedAt = performance.now();
    this.options.log.debug('assistant.steer_started', () => eventFields(event));
    background(
      steer(event, routing.chat)
        .then(async (steered) => {
          this.options.log.info('assistant.steer_settled', {
            ...eventFields(event),
            steered,
            durationMs: Math.round(performance.now() - startedAt),
          });
          if (steered) {
            this.taken.add(event.id);
            await this.options.events.mark(event.id, 'delivered_at');
            await this.options.events.mark(event.id, 'answered_at');
          } else this.unsteerable.add(event.id);
        })
        .catch((cause: unknown) => {
          this.unsteerable.add(event.id);
          this.options.log.warn('assistant.steer_failed', {
            eventId: event.id,
            reason: messageOf(cause),
          });
        })
        .finally(() => {
          this.steering.delete(event.id);
        }),
      'delivery.steer_failed',
    );
  }

  private async frozen(chat: string): Promise<boolean> {
    return (
      this.busy.has(chat) ||
      this.suspended.has(chat) ||
      (await this.options.frozen?.(chat)) === true
    );
  }
  async suspend(chatIds: readonly string[], remove: () => Promise<void>): Promise<void> {
    if (chatIds.some((id) => this.suspended.has(id)))
      throw new ApiError('conflict', 'This conversation is already being deleted.');
    const releases: (() => void)[] = [];
    for (const id of chatIds) {
      this.suspended.set(
        id,
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
      );
    }
    try {
      await remove();
    } finally {
      for (const id of chatIds) this.suspended.delete(id);
      for (const release of releases) release();
      this.pump();
    }
  }

  forget(chatIds: readonly string[]): void {
    for (const id of chatIds) {
      if (this.busy.has(id)) this.removed.add(id);
      this.blocked.delete(id);
      this.waits.get(id)?.();
    }
  }

  stopChat(chatId: string): boolean {
    const wake = this.waits.get(chatId);
    if (wake === undefined) return false;
    this.halted.add(chatId);
    wake();
    return true;
  }

  stop(): void {
    this.stopped = true;
  }

  private start(event: StoredEvent, routing: Extract<Routing, { kind: 'engine' }>): void {
    const authority = routing.authority;
    this.taken.add(event.id);
    this.busy.add(event.chat_id);
    if (authority?.repair_origin !== undefined) this.unsteerableChats.add(event.chat_id);
    this.options.log.info('assistant.delivery_started', {
      ...eventFields(event),
      busyChats: this.busy.size,
    });
    const attempt =
      authority === undefined
        ? this.attempt(event, routing)
        : withExecutionAuthority(authority, () => this.attempt(event, routing));
    background(
      attempt.finally(() => {
        this.busy.delete(event.chat_id);
        this.unsteerableChats.delete(event.chat_id);
        this.removed.delete(event.chat_id);
        this.pump();
      }),
      'delivery.attempt_failed',
    );
  }

  private async attempt(
    event: StoredEvent,
    routing: Extract<Routing, { kind: 'engine' }>,
  ): Promise<void> {
    const trace = new DeliveryTrace(this.options.log, event);
    for (let attempt = 1; ; attempt += 1) {
      const suspended = this.suspended.get(event.chat_id);
      if (suspended !== undefined) {
        trace.waiting(attempt);
        await suspended;
      }
      if (await this.retired(event)) {
        trace.retired(attempt);
        return;
      }
      try {
        await this.options.events.mark(event.id, 'delivered_at');
        await routing.engine.deliver(event, routing.chat);
        if (this.removed.has(event.chat_id)) {
          trace.discarded();
          return;
        }
        this.blocked.delete(event.chat_id);
        trace.finished(attempt);
        this.options.delivered(event);
        return;
      } catch (cause) {
        const reason = messageOf(cause);
        if (isModelUnavailable(cause)) {
          this.blocked.delete(event.chat_id);
          if (attempt > 1) this.options.retrying(event, false);
          await this.give(event, reason, 'model_unavailable');
          return;
        }
        this.blocked.set(event.chat_id, reason);
        trace.failed(attempt, cause, reason);
        if (this.stopped) return;
        this.options.retrying(event, true);
        await this.pause(trace, event.chat_id, attempt);
        if (this.halted.delete(event.chat_id)) {
          await this.settleStopped(trace, event);
          return;
        }
      }
    }
  }

  private pause(trace: DeliveryTrace, chatId: string, attempt: number): Promise<void> {
    trace.retryScheduled(attempt, DELIVERY_RETRY_MS);
    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.waits.delete(chatId);
        resolve();
      };
      const timer = setTimeout(done, DELIVERY_RETRY_MS);
      this.waits.set(chatId, done);
    });
  }

  private async settleStopped(trace: DeliveryTrace, event: StoredEvent): Promise<void> {
    trace.stopped();
    await this.answer(event.id);
    this.options.retrying(event, false);
    this.options.stopped(event);
  }

  private async retired(event: StoredEvent): Promise<boolean> {
    if (this.removed.has(event.chat_id)) return true;
    if ((await this.options.frozen?.(event.chat_id)) === true) return true;
    return !(await this.admitted(event));
  }
  private async admitted(event: StoredEvent): Promise<boolean> {
    if ([...this.admissions].every((admit) => admit(event))) return true;
    this.options.log.info('assistant.delivery_refused', {
      ...eventFields(event),
      admissions: this.admissions.size,
    });
    await this.answer(event.id);
    return false;
  }
  private async give(event: StoredEvent, reason: string, code: AssistantReasonCode): Promise<void> {
    this.options.log.warn('assistant.delivery_given_up', { ...eventFields(event), reason, code });
    await this.answer(event.id);
    this.options.failed(event, reason, code);
  }
}
