import { liveDeliveryAdmitted } from './delivery-admission';
import { ApiError, type AiChatRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type {
  AssistantEventsRepository,
  StoredEvent,
} from '../store/repositories/assistant-events';
import type { Engine } from './engines/engine';

const RETRY_MS = 5000;
const MAX_ATTEMPTS = 3;

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

function reasonOf(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : 'The request could not be handed to the assistant yet';
}

function wait(ms: number): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, ms);
  });
}

export class AssistantDelivery {
  private stopped = false;
  private readonly busy = new Set<string>();
  private readonly suspended = new Map<string, Promise<void>>();
  private readonly removed = new Set<string>();
  readonly blocked = new Map<string, string>();

  constructor(private readonly options: DeliveryOptions) {}

  added(): void {
    this.pump();
  }

  pump(): void {
    if (this.stopped) {
      return;
    }
    for (const event of this.options.events.pending()) {
      if (this.frozen(event.chat_id)) continue;
      if (!liveDeliveryAdmitted(this.options.events, event)) continue;
      const routing = this.options.route(event);
      if (routing.kind === 'blocked') {
        this.give(event, routing.reason);
      } else {
        if (this.options.admit?.(event) !== false) this.start(event, routing);
      }
    }
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
    void this.attempt(event, routing).finally(() => {
      this.busy.delete(event.chat_id);
      this.removed.delete(event.chat_id);
      this.pump();
    });
  }

  private async attempt(
    event: StoredEvent,
    routing: Extract<Routing, { kind: 'engine' }>,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const suspended = this.suspended.get(event.chat_id);
      if (suspended !== undefined) await suspended;
      if (this.retired(event)) return;
      try {
        this.options.events.mark(event.id, 'delivered_at');
        await routing.engine.deliver(event, routing.chat);
        if (this.removed.has(event.chat_id)) return;
        this.blocked.delete(event.chat_id);
        this.options.delivered(event);
        return;
      } catch (cause) {
        const reason = reasonOf(cause);
        this.blocked.set(event.chat_id, reason);
        this.options.log.warn('assistant.delivery_failed', { eventId: event.id, attempt, reason });
        if (attempt < MAX_ATTEMPTS && !this.stopped) {
          await wait(RETRY_MS);
        }
      }
    }
    if (this.removed.has(event.chat_id)) return;
    this.give(
      event,
      this.blocked.get(event.chat_id) ?? 'the request could not be handed to the assistant',
    );
  }

  private retired(event: StoredEvent): boolean {
    if (this.removed.has(event.chat_id)) return true;
    if (this.options.frozen?.(event.chat_id) === true) return true;
    return !liveDeliveryAdmitted(this.options.events, event);
  }
  private give(event: StoredEvent, reason: string): void {
    this.options.events.mark(event.id, 'answered_at');
    this.options.failed(event, reason);
  }
}
