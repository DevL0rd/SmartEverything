import { Logger } from '@smarteverything/logging';
import { ApiError, type AiHarnessEvent } from '@smarteverything/domain';
import type { NativeTurnIdentity } from './turn-correlation';

export class ProcessPublication {
  private readonly pending = new Map<string, AiHarnessEvent[]>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly refused = new Map<
    string,
    { readonly identity: NativeTurnIdentity; readonly error: ApiError }
  >();
  private readonly log = new Logger('hub.harness');
  constructor(private readonly publish: (event: AiHarnessEvent) => Promise<void>) {}
  admit(id: string, identity: NativeTurnIdentity | undefined): void {
    const refusal = this.refused.get(id);
    if (
      refusal !== undefined &&
      refusal.identity.delivery_id === identity?.delivery_id &&
      refusal.identity.native_turn === identity.native_turn
    )
      throw refusal.error;
  }
  close(id: string): void {
    this.refused.delete(id);
  }
  keep(event: AiHarnessEvent): void {
    const queue = this.pending.get(event.session_id) ?? [];
    queue.push(event);
    this.pending.set(event.session_id, queue);
  }
  async flush(id: string): Promise<void> {
    const existing = this.running.get(id);
    if (existing !== undefined) return existing;
    const work = this.send(id).finally(() => {
      this.running.delete(id);
    });
    this.running.set(id, work);
    return work;
  }
  attempt(id: string): Promise<void> {
    return this.flush(id).catch((cause: unknown): void => {
      this.log.error('publication.failed', cause, { session_id: id });
    });
  }
  private retireRefusal(event: AiHarnessEvent, cause: unknown): boolean {
    if (
      !(cause instanceof ApiError) ||
      cause.code !== 'command_refused' ||
      event.kind !== 'state' ||
      event.delivery_id === undefined ||
      event.native_turn === undefined
    )
      return false;
    this.refused.set(event.session_id, {
      identity: { delivery_id: event.delivery_id, native_turn: event.native_turn },
      error: cause,
    });
    return true;
  }
  private async send(id: string): Promise<void> {
    const queue = this.pending.get(id);
    if (queue === undefined) return;
    while (queue.length > 0) {
      const event = queue[0];
      if (event === undefined)
        throw new Error('Native publication queue contains an absent event.');
      try {
        await this.publish(event);
      } catch (cause) {
        if (!this.retireRefusal(event, cause)) throw cause;
      }
      queue.shift();
    }
    this.pending.delete(id);
  }
}
