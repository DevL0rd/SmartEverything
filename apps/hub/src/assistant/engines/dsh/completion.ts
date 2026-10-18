import { savedWebSources } from '../../web-search-supplier';
import { Logger } from '@smarteverything/logging';
import type { AiChatRow, AiHarnessEvent } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ConversationLog } from '../../conversation-log';
import type { HarnessService } from '../../../harness/service';
import { eventAuthority, withExecutionAuthority } from '../../turn-authority';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import type { TurnStream } from '../../conversation/stream';
import type { AssistantReasonCode } from '@smarteverything/domain';
import { CONNECTION_LOST, STOPPED_BY_USER } from '../../interruption';

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
  readonly admissionRefused?: boolean;
  readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
  readonly retire: () => void;
}
const log = new Logger('hub.harness');
const OUT_OF_CREDIT = /\b402\b|insufficient (?:credits?|funds)|out of credits?|payment required/i;
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
    () => {
      if (ok) {
        conversation.finishReply(turn.replyId, text, {
          model: service.binding(turn.chat).model,
          steps: turn.stream.settled(),
          sources: savedWebSources(service, turn.replyId),
        });
        conversation.stateOf(turn.event.message_id, 'answered');
      } else {
        const failure = completionFailure(event, input.admissionRefused === true);
        log.warn('native_completion.failed', {
          eventId: turn.event.id,
          chatId: turn.chat.id,
          outcome: event.kind,
          reasonCode: failure.code,
          reason: failure.reason,
          refused: input.admissionRefused === true,
        });
        conversation.failReply(turn.replyId, { text, ...failure }, turn.stream.settled());
        conversation.failedMessage(turn.event.message_id, failure.reason, failure.code);
      }
      service.store.harnessChildren.finish(turn.event.id, ok ? 'completed' : 'failed', text);
      service.store.assistantEvents.mark(turn.event.id, 'answered_at');
    },
  );
}
export function completionFailure(
  event: NativeCompletion,
  admissionRefused: boolean,
): { readonly reason: string; readonly code: AssistantReasonCode } {
  if (event.kind === 'completed') return { reason: STOPPED_BY_USER, code: 'stopped' };
  if (!admissionRefused && event.failure.code === 'source_outcome_unknown')
    return { reason: CONNECTION_LOST, code: 'interrupted' };
  return {
    reason: event.failure.message,
    code: OUT_OF_CREDIT.test(event.failure.message) ? 'credits' : 'unknown',
  };
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
  log.info('native_completion.retired', {
    eventId: input.turn.event.id,
    chatId: input.turn.chat.id,
    ok,
    outcome: event.kind,
    replyLength: input.turn.stream.spoken.length,
  });
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
