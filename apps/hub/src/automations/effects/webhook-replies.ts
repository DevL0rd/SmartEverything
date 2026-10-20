import type { JsonValue } from '@smarteverything/domain';
import { IntegrationError } from './integration-error';

export interface WebhookReply {
  readonly status: number;
  readonly body: JsonValue | undefined;
  readonly headers: Readonly<Record<string, string>>;
}

interface Pending {
  readonly deliver: (reply: WebhookReply) => void;
  answered: boolean;
}

export class WebhookReplies {
  private readonly pending = new Map<string, Pending>();

  get waiting(): number {
    return this.pending.size;
  }

  expect(runId: string): Promise<WebhookReply> {
    return new Promise((resolve) => {
      this.pending.set(runId, { deliver: resolve, answered: false });
    });
  }

  respond(runId: string, reply: WebhookReply): void {
    const entry = this.pending.get(runId);
    if (entry === undefined) {
      throw new IntegrationError(
        'Invalid',
        'This run was not started by a webhook that waits for an answer.',
      );
    }
    if (entry.answered) {
      throw new IntegrationError('Invalid', 'The webhook has been answered already.');
    }
    entry.answered = true;
    entry.deliver(reply);
  }

  release(runId: string): void {
    this.pending.delete(runId);
  }
}
