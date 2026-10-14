import { Logger } from '@smarteverything/logging';
import type { readNativeHistory } from '@smarteverything/harness/process';
import type { Store } from '../../../store/store';
import type { HarnessDelivery } from '../../../store/repositories/harness-deliveries';
import type { ConversationLog } from '../../conversation-log';
import type { TurnEnded } from '../../service-contract';
import { ApiError } from '@smarteverything/domain';
import { historyTimeline } from './history-timeline';
import { nativeDeliveryHistory } from './native-history';
import type { NativeInputHistory } from '@smarteverything/harness';
import type { ChatTimelineEmbed, SettledStep } from '@smarteverything/domain';
import { z } from 'zod';
const log = new Logger('hub.harness');
type NativeHistory = ReturnType<typeof readNativeHistory>;
interface NativeOutcome {
  readonly known: boolean;
  readonly ok: boolean;
  readonly text: string;
  readonly end: number | null;
  readonly steps: readonly SettledStep[];
  readonly timeline: ChatTimelineEmbed;
}
export function reconcileNativeReplies(
  store: Store,
  conversation: ConversationLog,
  finished: TurnEnded,
  pendingInput?: (input: NativeInputHistory) => readonly string[],
): void {
  for (const delivery of store.harnessDeliveries.unsettled()) {
    const event = store.assistantEvents.event(delivery.delivery_id);
    const history = nativeDeliveryHistory(store, delivery, event.profile_id, event.chat_id);
    if (
      pendingInput?.(history).includes(delivery.delivery_id) === true &&
      !history.events.some(
        (record) => record.type === 'user/message' && record.data.id === delivery.delivery_id,
      )
    ) {
      restorePending(store, delivery, event.message_id);
      continue;
    }
    if (delivery.state === 'admitted') reconcile(store, delivery, { conversation, finished });
  }
}
function reconcile(
  store: Store,
  delivery: HarnessDelivery,
  ports: { readonly conversation: ConversationLog; readonly finished: TurnEnded },
): void {
  const event = store.assistantEvents.event(delivery.delivery_id);
  const outcome = nativeOutcome(
    nativeDeliveryHistory(store, delivery, event.profile_id, event.chat_id).events,
    delivery,
  );
  log.warn('reply.reconciled', {
    delivery_id: delivery.delivery_id,
    session_id: delivery.session_id,
    known: outcome.known,
    completed: outcome.ok,
    end_seq: outcome.end,
    settled_steps: outcome.steps,
  });
  const reason = outcome.known
    ? 'Native turn ended without successful completion.'
    : 'The hub restarted before the reply completed; its retained native history was not replayed.';
  const replyId = delivery.reply_id;
  const model =
    replyId === null ? null : z.string().parse(store.assistantChat.message(replyId).model);
  store.harnessDeliveries.update(
    delivery.delivery_id,
    outcome.known ? 'completed' : 'unknown',
    outcome.text,
    () => {
      if (replyId !== null && model !== null)
        projectReply(ports.conversation, { id: replyId, model }, outcome, reason);
      ports.conversation.stateOf(event.message_id, outcome.ok ? 'answered' : 'failed');
      store.harnessChildren.finish(
        event.id,
        outcome.known ? (outcome.ok ? 'completed' : 'failed') : 'unknown',
        outcome.text,
      );
      ports.finished(event, outcome.text, outcome.ok);
    },
  );
  if (outcome.end !== null)
    store.harnessDeliveries.cut(delivery.delivery_id, delivery.start_seq ?? 0, outcome.end);
}
function projectReply(
  conversation: ConversationLog,
  reply: { readonly id: string; readonly model: string },
  outcome: NativeOutcome,
  reason: string,
): void {
  conversation.timeline(reply.id, outcome.timeline);
  if (outcome.ok)
    conversation.finishReply(reply.id, outcome.text, {
      model: reply.model,
      steps: outcome.steps,
      sources: [],
    });
  else
    conversation.failReply(
      reply.id,
      { text: outcome.text, reason, code: outcome.known ? 'interrupted' : 'unknown' },
      outcome.steps,
    );
}

function restorePending(store: Store, delivery: HarnessDelivery, messageId: string | null): void {
  store.harnessDeliveries.restorePending(delivery.delivery_id, () => {
    if (messageId !== null)
      store.assistantChat.updateMessage(messageId, {
        state: 'delivered',
        reason: null,
        reason_code: null,
      });
    if (delivery.reply_id !== null)
      store.assistantChat.updateMessage(delivery.reply_id, {
        state: 'working',
        reason: null,
        reason_code: null,
      });
  });
}
function nativeOutcome(history: NativeHistory, delivery: HarnessDelivery): NativeOutcome {
  const index = history.findIndex(
    (record) => record.type === 'user/message' && record.data.id === delivery.delivery_id,
  );
  const tail = index < 0 ? [] : history.slice(index);
  const ended = tail.find((record) => record.type === 'turn/end');
  const known = ended?.type === 'turn/end';
  const ok =
    known && (ended.data.reason.kind === 'completed' || ended.data.reason.kind === 'max-tokens');
  const entered = tail.filter((record) => ended === undefined || record.seq <= ended.seq);
  const text = entered
    .flatMap((record) =>
      record.type === 'assistant/message'
        ? record.data.message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
        : [],
    )
    .join('');
  return {
    known,
    ok,
    text: text === '' ? delivery.text : text,
    end: ended?.seq ?? null,
    steps: toolSteps(entered),
    timeline: historyTimeline(entered, nativeInterrupted(ended)),
  };
}
function toolSteps(history: NativeHistory): SettledStep[] {
  const names = new Map<string, string>();
  const steps: SettledStep[] = [];
  for (const record of history) {
    if (record.type === 'tool/call') names.set(record.data.callId, record.data.name);
    if (record.type !== 'tool/result') continue;
    const name = names.get(record.data.message.toolCallId);
    if (name === undefined)
      throw new ApiError(
        'conflict',
        'Native result lost its original tool identity during reconciliation.',
      );
    steps.push({ title: name, outcome: record.data.message.isError === true ? 'failed' : 'done' });
  }
  return steps;
}

export function nativeReplyId(delivery: HarnessDelivery): string {
  if (delivery.reply_id === null)
    throw new ApiError('conflict', 'The admitted native reply was deleted and cannot be replayed.');
  return delivery.reply_id;
}

function nativeInterrupted(
  ended: Extract<NativeHistory[number], { type: 'turn/end' }> | undefined,
): boolean {
  return ended !== undefined && ['aborted', 'interrupted'].includes(ended.data.reason.kind);
}
