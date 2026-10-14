import {
  ApiError,
  harnessTargetKey,
  type AiChatRow,
  type DshWriterClaim,
} from '@smarteverything/domain';
import { waitForWriterExpiry } from '../../../harness/writer-expiry';
import { writerIdentity } from '../../../store/repositories/dsh-session-claims';
import { TurnStream } from '../../conversation/stream';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { DeliveryStreamOptions } from './delivery-streams';

interface Recovering {
  readonly event: StoredEvent;
  readonly abort: AbortController;
  readonly stream: TurnStream;
}

export class NativeWriterRecovery {
  readonly active = new Map<string, Recovering>();
  constructor(private readonly options: DeliveryStreamOptions) {}

  hasChat(id: string): boolean {
    return this.active.has(id);
  }
  interrupt(id: string): boolean {
    const waiting = this.active.get(id);
    if (waiting === undefined) return false;
    this.options.service.store.assistantEvents.mark(waiting.event.id, 'answered_at');
    this.options.conversation.failedMessage(waiting.event.message_id, 'Stopped.', 'stopped');
    waiting.abort.abort();
    waiting.stream.snapshot('idle', 'stopped', null);
    this.options.finished(waiting.event, '', false);
    return true;
  }
  async wait(event: StoredEvent, chat: AiChatRow): Promise<boolean> {
    const claim = this.retiredClaim(chat);
    if (claim === undefined) return true;
    const abort = new AbortController();
    const stream = new TurnStream(
      { chatId: chat.id, turnId: event.id, messageId: null, profileId: event.profile_id },
      this.options.emit,
    );
    this.active.set(chat.id, { event, abort, stream });
    stream.snapshot('thinking', null, 'reconnecting');
    try {
      if (!(await waitForWriterExpiry(claim, abort.signal))) return false;
      this.requireUnchanged(chat, claim);
      return true;
    } finally {
      this.active.delete(chat.id);
      if (!abort.signal.aborted) stream.snapshot('idle', null, null);
      stream.close();
    }
  }
  private retiredClaim(chat: AiChatRow): DshWriterClaim | undefined {
    const service = this.options.service;
    const binding = service.binding(chat);
    if (binding.session_id === null) return undefined;
    const writer = service.store.dshSessions.writerState(binding.session_id, chat.profile_id);
    const claim = writer.claim;
    if (writer.state !== 'active' || claim === null || Date.parse(claim.expires_at) <= Date.now())
      return undefined;
    const connection = service.directory.get(binding.execution_target);
    if (
      harnessTargetKey(claim.target) !== harnessTargetKey(connection.host.target) ||
      (claim.runtime_instance === connection.host.runtime_instance &&
        claim.connection_generation === connection.host.connection_generation) ||
      connection.hasSession?.(claim.session_id, claim.epoch) !== false
    )
      return undefined;
    return claim;
  }
  private requireUnchanged(chat: AiChatRow, claim: DshWriterClaim): void {
    const service = this.options.service;
    const binding = service.binding(
      service.own({ profileId: chat.profile_id, role: 'member' }, chat.id),
    );
    const current = service.store.dshSessions.writerState(claim.session_id, chat.profile_id).claim;
    if (
      binding.session_id !== claim.session_id ||
      harnessTargetKey(binding.execution_target) !== harnessTargetKey(claim.target) ||
      current === null ||
      writerIdentity(current) !== writerIdentity(claim)
    )
      throw new ApiError('conflict', 'The conversation writer changed during native recovery.');
  }
}
