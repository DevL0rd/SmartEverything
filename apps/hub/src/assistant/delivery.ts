import type { AiChatRow } from '@smarteverything/domain';
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
      if (this.busy.has(event.chat_id)) {
        continue;
      }
      const routing = this.options.route(event);
      if (routing.kind === 'blocked') {
        this.give(event, routing.reason);
      } else {
        this.start(event, routing);
      }
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private start(event: StoredEvent, routing: Extract<Routing, { kind: 'engine' }>): void {
    this.busy.add(event.chat_id);
    void this.attempt(event, routing).finally(() => {
      this.busy.delete(event.chat_id);
      this.pump();
    });
  }

  private async attempt(
    event: StoredEvent,
    routing: Extract<Routing, { kind: 'engine' }>,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        this.options.events.mark(event.id, 'delivered_at');
        await routing.engine.deliver(event, routing.chat);
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
    this.give(
      event,
      this.blocked.get(event.chat_id) ?? 'the request could not be handed to the assistant',
    );
  }

  private give(event: StoredEvent, reason: string): void {
    this.options.events.mark(event.id, 'answered_at');
    this.options.failed(event, reason);
  }
}
