import { savedWebSources } from '../../web-search-supplier';
import { Logger } from '@smarteverything/logging';
import type { AiChatRow, AiHarnessEvent } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ConversationLog } from '../../conversation-log';
import type { HarnessService } from '../../../harness/service';
import { eventAuthority, withExecutionAuthority } from '../../execution-authority';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import type { TurnStream } from '../../conversation/stream';

export type NativeCompletion =
  | Pick<Extract<AiHarnessEvent, { kind: 'completed' }>, 'kind' | 'interrupted'>
  | Pick<Extract<AiHarnessEvent, { kind: 'failed' }>, 'kind' | 'failure'>;
export interface NativeCompletionTurn {
  readonly event: StoredEvent;
  readonly chat: AiChatRow;
  readonly replyId: string;
  readonly stream: TurnStream;
}
interface Completion {
  readonly service: HarnessService;
  readonly conversation: ConversationLog;
  readonly turn: NativeCompletionTurn;
  readonly event: NativeCompletion;
  readonly ack: (() => void) | undefined;
  readonly admissionRefused?: boolean;
  readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
  readonly retire: () => void;
}
const log = new Logger('hub.harness');
function unconfirmedCompletion(): NativeCompletion {
  return {
    kind: 'failed',
    failure: {
      code: 'source_outcome_unknown',
      message:
        'Native completion authority is unavailable; effects may be unknown and its result was not trusted.',
      retry_at: null,
    },
  };
}
export function completeNativeTurn(input: Completion): void {
  const { turn } = input;
  let event = unconfirmedCompletion();
  let persisted = false;
  try {
    const authority = completionAuthority(input.service, turn.event);
    event =
      authority === undefined && input.admissionRefused !== true
        ? unconfirmedCompletion()
        : input.event;
    persistCompletion(input, event);
    persisted = true;
    if (authority !== undefined) notifyCompletion(input, event);
  } finally {
    retireCompletion(input, persisted ? event : unconfirmedCompletion());
  }
}
function completionAuthority(
  service: HarnessService,
  event: StoredEvent,
): ConversationAuthority | undefined {
  try {
    return eventAuthority(service.store, event);
  } catch (cause) {
    log.warn('native_completion.authority_unavailable', {
      event_id: event.id,
      failure: cause instanceof Error ? cause.name : 'InvalidAuthority',
    });
    return undefined;
  }
}
function persistCompletion(input: Completion, event: NativeCompletion): void {
  const { turn, service, conversation } = input;
  const ok = event.kind === 'completed' && !event.interrupted;
  const text = turn.stream.spoken;
  service.store.harnessDeliveries.update(
    turn.event.id,
    event.kind === 'failed' && event.failure.code === 'source_outcome_unknown'
      ? 'unknown'
      : 'completed',
    text,
    () => {
      if (ok)
        conversation.finishReply(turn.replyId, text, {
          model: service.binding(turn.chat).model,
          steps: turn.stream.settled(),
          sources: savedWebSources(service, turn.replyId),
        });
      else
        conversation.failReply(
          turn.replyId,
          {
            text,
            reason: event.kind === 'failed' ? event.failure.message : 'Stopped.',
            code:
              input.admissionRefused === true
                ? 'stopped'
                : event.kind === 'failed'
                  ? 'unknown'
                  : 'interrupted',
          },
          turn.stream.settled(),
        );
      conversation.stateOf(turn.event.message_id, ok ? 'answered' : 'failed');
      service.store.harnessChildren.finish(turn.event.id, ok ? 'completed' : 'failed', text);
      service.store.assistantEvents.mark(turn.event.id, 'answered_at');
      input.ack?.();
    },
  );
}
function notifyCompletion(input: Completion, event: NativeCompletion): void {
  const authority = completionAuthority(input.service, input.turn.event);
  if (authority === undefined) return;
  withExecutionAuthority(authority, () => {
    input.finished(
      input.turn.event,
      input.turn.stream.spoken,
      event.kind === 'completed' && !event.interrupted,
    );
  });
}
function retireCompletion(input: Completion, event: NativeCompletion): void {
  const ok = event.kind === 'completed' && !event.interrupted;
  try {
    input.turn.stream.snapshot(
      ok ? 'idle' : 'failed',
      ok ? 'stop' : event.kind === 'completed' && event.interrupted ? 'stopped' : 'error',
      ok ? null : 'Native work stopped.',
    );
  } finally {
    try {
      input.turn.stream.close();
    } finally {
      input.retire();
    }
  }
}
