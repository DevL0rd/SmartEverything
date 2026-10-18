import { ApiError, type AiChatRow, type ApiErrorCode } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type {
  AssistantEventsRepository,
  StoredEvent,
} from '../store/repositories/assistant-events';
import { DeliveryTrace, eventFields } from './delivery-trace';
import type { Engine } from './engines/engine';
import { background, messageOf } from '@smarteverything/logging';

const RETRY_MS = 5000;
const MAX_ATTEMPTS = 3;
const PERMANENT_CODES: ReadonlySet<ApiErrorCode> = new Set([
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'payload_too_large',
  'unsupported_media_type',
  'command_refused',
]);

function permanentFailure(cause: unknown): boolean {
  return cause instanceof ApiError && PERMANENT_CODES.has(cause.code);
}

export type Routing =
  | { readonly kind: 'engine'; readonly engine: Engine; readonly chat: AiChatRow }
  | { readonly kind: 'blocked'; readonly reason: string };

export interface DeliveryOptions {
  readonly events: AssistantEventsRepository;
  readonly frozen?: (chatId: string) => boolean;
  readonly admit?: (event: StoredEvent) => boolean;
  readonly route: (event: StoredEvent) => Routing;
  readonly delivered: (event: StoredEvent) => void;
  readonly failed: (event: StoredEvent, reason: string) => void;
  readonly log: Logger;
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

export class AssistantDelivery {
  private stopped = false;
  private readonly busy = new Set<string>();
  private readonly steering = new Set<string>();
  private readonly unsteerable = new Set<string>();
  private readonly suspended = new Map<string, Promise<void>>();
  private readonly removed = new Set<string>();
  readonly blocked = new Map<string, string>();
  private readonly admissions = new Set<(event: StoredEvent) => boolean>();

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
    if (this.stopped) {
      return;
    }
    const pending = this.options.events.pending();
    this.options.log.trace('assistant.pump_ran', {
      pending: pending.length,
      busy: this.busy.size,
      suspended: this.suspended.size,
    });
    for (const event of pending) {
      if (this.steerable(event)) {
        this.steer(event);
        continue;
      }
      if (this.frozen(event.chat_id)) {
        this.options.log.trace('assistant.delivery_deferred', () => ({
          ...eventFields(event),
          busy: this.busy.has(event.chat_id),
          suspended: this.suspended.has(event.chat_id),
        }));
        continue;
      }
      if (!this.admitted(event)) continue;
      const routing = this.options.route(event);
      if (routing.kind === 'blocked') {
        this.options.log.info('assistant.delivery_blocked', {
          ...eventFields(event),
          reason: routing.reason,
        });
        this.give(event, routing.reason);
      } else {
        if (this.options.admit?.(event) !== false) this.start(event, routing);
        else this.options.log.debug('assistant.delivery_held', () => eventFields(event));
      }
    }
  }

  private steerable(event: StoredEvent): boolean {
    return (
      this.busy.has(event.chat_id) &&
      !this.suspended.has(event.chat_id) &&
      this.options.frozen?.(event.chat_id) !== true &&
      !this.steering.has(event.id) &&
      !this.unsteerable.has(event.id)
    );
  }

  private steer(event: StoredEvent): void {
    const routing = this.options.route(event);
    const steer = routing.kind === 'engine' ? routing.engine.steer : undefined;
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
        .then((steered) => {
          this.options.log.info('assistant.steer_settled', {
            ...eventFields(event),
            steered,
            durationMs: Math.round(performance.now() - startedAt),
          });
          if (steered) this.options.events.mark(event.id, 'delivered_at');
          else this.unsteerable.add(event.id);
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

  private frozen(chat: string): boolean {
    return this.busy.has(chat) || this.suspended.has(chat) || this.options.frozen?.(chat) === true;
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
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private start(event: StoredEvent, routing: Extract<Routing, { kind: 'engine' }>): void {
    this.busy.add(event.chat_id);
    this.options.log.info('assistant.delivery_started', {
      ...eventFields(event),
      busyChats: this.busy.size,
    });
    background(
      this.attempt(event, routing).finally(() => {
        this.busy.delete(event.chat_id);
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
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const suspended = this.suspended.get(event.chat_id);
      if (suspended !== undefined) {
        trace.waiting(attempt);
        await suspended;
      }
      if (this.retired(event)) {
        trace.retired(attempt);
        return;
      }
      try {
        this.options.events.mark(event.id, 'delivered_at');
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
        this.blocked.set(event.chat_id, reason);
        trace.failed(attempt, MAX_ATTEMPTS, cause, reason);
        if (permanentFailure(cause) || this.stopped) break;
        await this.backoff(trace, attempt);
      }
    }
    if (this.removed.has(event.chat_id)) return;
    trace.abandoned(MAX_ATTEMPTS, this.blocked.get(event.chat_id));
    this.give(
      event,
      this.blocked.get(event.chat_id) ?? 'the request could not be handed to the assistant',
    );
  }

  private async backoff(trace: DeliveryTrace, attempt: number): Promise<void> {
    if (attempt >= MAX_ATTEMPTS) return;
    trace.retryScheduled(attempt, RETRY_MS);
    await wait(RETRY_MS);
  }

  private retired(event: StoredEvent): boolean {
    if (this.removed.has(event.chat_id)) return true;
    if (this.options.frozen?.(event.chat_id) === true) return true;
    return !this.admitted(event);
  }
  private admitted(event: StoredEvent): boolean {
    if ([...this.admissions].every((admit) => admit(event))) return true;
    this.options.log.info('assistant.delivery_refused', {
      ...eventFields(event),
      admissions: this.admissions.size,
    });
    this.options.events.mark(event.id, 'answered_at');
    return false;
  }
  private give(event: StoredEvent, reason: string): void {
    this.options.log.warn('assistant.delivery_given_up', { ...eventFields(event), reason });
    this.options.events.mark(event.id, 'answered_at');
    this.options.failed(event, reason);
  }
}
