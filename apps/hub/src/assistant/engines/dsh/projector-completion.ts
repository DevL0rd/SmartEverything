import { Logger, background } from '@smarteverything/logging';
import type {
  AiChatRow,
  AiHarnessEvent,
  AiHarnessFailure,
  ChatTimelineEmbed,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { ConversationLog } from '../../conversation-log';
import type { HarnessService } from '../../../harness/service';
import { eventAuthority, withExecutionAuthority } from '../../turn-authority';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import type { TurnStream } from '../../conversation/stream';
import type { AssistantReasonCode } from '@smarteverything/domain';
import { CONNECTION_LOST, STOPPED_BY_USER } from '../../interruption';

export type NativeCompletion =
  | Pick<Extract<AiHarnessEvent, { kind: 'completed' }>, 'kind' | 'interrupted' | 'failure'>
  | Pick<Extract<AiHarnessEvent, { kind: 'failed' }>, 'kind' | 'failure'>;
interface ActiveTurnLike {
  readonly steered: readonly StoredEvent[];
  readonly stream: TurnStream;
}
export interface NativeCompletionTurn {
  readonly event: StoredEvent;
  readonly chat: AiChatRow;
  readonly replyId: string;
  readonly stream: TurnStream;
}
export interface ReplayedReply {
  readonly timeline?: ChatTimelineEmbed;
  readonly kept: string;
  readonly model: string;
  readonly interruption: string;
}
interface Completion {
  readonly service: HarnessService;
  readonly conversation: ConversationLog;
  readonly turn: NativeCompletionTurn;
  readonly event: NativeCompletion;
  readonly admissionRefused?: boolean;
  readonly replay?: ReplayedReply;
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
function replyText(input: Completion): string {
  const spoken = input.turn.stream.spoken;
  return spoken === '' ? (input.replay?.kept ?? '') : spoken;
}
function trusted(input: Completion, authority: ConversationAuthority | undefined): boolean {
  return input.replay !== undefined || authority !== undefined || input.admissionRefused === true;
}
export async function completeNativeTurn(input: Completion): Promise<void> {
  const { turn } = input;
  let event = unconfirmedCompletion();
  let persisted = false;
  try {
    const authority =
      input.replay === undefined ? await completionAuthority(input.service, turn.event) : undefined;
    event = trusted(input, authority) ? input.event : unconfirmedCompletion();
    await persistCompletion(input, event);
    persisted = true;
    notifyCompletion(input, event, authority);
  } finally {
    retireCompletion(input, persisted ? event : unconfirmedCompletion());
  }
}
async function completionAuthority(
  service: HarnessService,
  event: StoredEvent,
): Promise<ConversationAuthority | undefined> {
  try {
    return await eventAuthority(service.store, event);
  } catch (cause) {
    log.warn('native_completion.authority_unavailable', {
      event_id: event.id,
      failure: cause instanceof Error ? cause.name : 'InvalidAuthority',
    });
    return undefined;
  }
}
async function persistCompletion(input: Completion, event: NativeCompletion): Promise<void> {
  const { turn, service, conversation } = input;
  const ok = event.kind === 'completed' && !event.interrupted;
  const text = replyText(input);
  const steps = turn.stream.settled();
  const outcome =
    event.kind === 'failed' && event.failure.code === 'source_outcome_unknown'
      ? 'unknown'
      : 'completed';
  if (!ok) {
    const failure = failureOf(input, event);
    log.warn('native_completion.failed', {
      eventId: turn.event.id,
      chatId: turn.chat.id,
      outcome: event.kind,
      reasonCode: failure.code,
      reason: failure.reason,
      refused: input.admissionRefused === true,
      replayed: input.replay !== undefined,
    });
  }
  await conversation.completeNative({
    deliveryId: turn.event.id,
    outcome,
    replyId: turn.replyId,
    messageId: turn.event.message_id,
    result: ok
      ? { ok: true, text, steps, model: input.replay?.model ?? service.binding(turn.chat).model }
      : { ok: false, text, steps, ...failureOf(input, event) },
  });
}
export function completionFailure(
  event: NativeCompletion,
  admissionRefused: boolean,
  interruption: string = CONNECTION_LOST,
): { readonly reason: string; readonly code: AssistantReasonCode } {
  if (event.kind === 'completed')
    return event.failure === undefined
      ? { reason: STOPPED_BY_USER, code: 'stopped' }
      : { reason: event.failure.message, code: failureReasonCode(event.failure) };
  if (!admissionRefused && event.failure.code === 'source_outcome_unknown')
    return { reason: interruption, code: 'interrupted' };
  return { reason: event.failure.message, code: failureReasonCode(event.failure) };
}
function failureReasonCode(failure: AiHarnessFailure): AssistantReasonCode {
  if (failure.code === 'quota_exhausted' || OUT_OF_CREDIT.test(failure.message)) return 'credits';
  return failure.code === 'route_unavailable' ? 'model_unavailable' : 'unknown';
}
function notifyCompletion(
  input: Completion,
  event: NativeCompletion,
  authority: ConversationAuthority | undefined,
): void {
  const ok = event.kind === 'completed' && !event.interrupted;
  if (input.replay !== undefined) {
    input.finished(input.turn.event, ok ? replyText(input) : failureOf(input, event).reason, ok);
    return;
  }
  if (authority === undefined) return;
  withExecutionAuthority(authority, () => {
    input.finished(
      input.turn.event,
      ok ? input.turn.stream.spoken : failureOf(input, event).reason,
      ok,
    );
  });
}
function failureOf(
  input: Completion,
  event: NativeCompletion,
): { readonly reason: string; readonly code: AssistantReasonCode } {
  return completionFailure(event, input.admissionRefused === true, input.replay?.interruption);
}
export function settleStream(stream: TurnStream, event: NativeCompletion): void {
  const ok = event.kind === 'completed' && !event.interrupted;
  try {
    stream.snapshot(
      ok ? 'idle' : 'failed',
      ok ? 'stop' : stoppedByPerson(event) ? 'stopped' : 'error',
      ok ? null : 'Native work stopped.',
    );
  } finally {
    stream.close();
  }
}
function stoppedByPerson(event: NativeCompletion): boolean {
  return event.kind === 'completed' && event.interrupted && event.failure === undefined;
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
    settleStream(input.turn.stream, event);
  } finally {
    input.retire();
  }
}
export function settleSteered(
  conversation: ConversationLog,
  finished: Completion['finished'],
  turn: Pick<ActiveTurnLike, 'steered' | 'stream'>,
  event: NativeCompletion,
): void {
  const ok = event.kind === 'completed' && !event.interrupted;
  const failure = completionFailure(event, false);
  for (const steered of turn.steered) {
    const written = ok
      ? conversation.stateOf(steered.message_id, 'answered')
      : conversation.failedMessage(steered.message_id, failure.reason, failure.code);
    const settled = (): void => {
      finished(steered, ok ? turn.stream.spoken : failure.reason, ok);
    };
    background(
      written.then(settled, (cause: unknown) => {
        settled();
        throw cause;
      }),
      'dsh.steered_state_failed',
      { eventId: steered.id },
    );
  }
}
