import { Logger, background } from '@smarteverything/logging';
import {
  nativeInputId,
  projectDelivery,
  readNativeHistory,
} from '@smarteverything/harness/process';
import type { DeliveryProjection } from '@smarteverything/harness/process';
import type { NativeInputHistory } from '@smarteverything/harness';
import { ApiError, CHAT_TIMELINE_EMBED } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import type { HarnessDelivery } from '../../../store/repositories/harness-deliveries';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { helperParentMessageId } from '../../delegation/helper-dialogue';
import { HUB_RESTARTED } from '../../interruption';
import { completionFailure, type NativeCompletion } from './projector-completion';
import type { ConversationProjector } from './projector';

const log = new Logger('hub.harness');

const UNCONFIRMED: NativeCompletion = {
  kind: 'failed',
  failure: {
    code: 'source_outcome_unknown',
    message: 'The turn has no recorded end.',
    retry_at: null,
  },
};

interface DeliveryHistory {
  readonly metadata: NonNullable<ReturnType<Store['dshSessions']['stat']>>;
  readonly events: ReturnType<typeof readNativeHistory>;
}

function deliveryHistory(
  store: Store,
  delivery: HarnessDelivery,
  event: StoredEvent,
): DeliveryHistory {
  const metadata = store.dshSessions.stat(delivery.session_id, event.profile_id);
  if (metadata?.chat_id !== event.chat_id)
    throw new ApiError('forbidden', 'Retained delivery/native conversation binding differs.');
  const records = store.dshSessions.readAll(delivery.session_id, event.profile_id);
  return { metadata, events: readNativeHistory(metadata.header, records) };
}

function completionOf(projection: DeliveryProjection): NativeCompletion {
  const outcome = projection.end?.outcome;
  if (outcome === undefined) return UNCONFIRMED;
  return outcome.kind === 'completed'
    ? { kind: 'completed', interrupted: outcome.interrupted }
    : {
        kind: 'failed',
        failure: { code: 'operation_failed', message: outcome.failure.message, retry_at: null },
      };
}

export function reconcileNativeReplies(
  projector: ConversationProjector,
  pendingInput?: (input: NativeInputHistory) => readonly string[],
): void {
  const { store } = projector.options.service;
  for (const delivery of store.harnessDeliveries.unsettled()) {
    const event = store.assistantEvents.event(delivery.delivery_id);
    const history = deliveryHistory(store, delivery, event);
    const received = history.events.some(
      (record) =>
        record.type === 'user/message' && nativeInputId(record.data) === delivery.delivery_id,
    );
    const pending = pendingInput?.(history).includes(delivery.delivery_id) === true;
    if (!received) {
      if (helperParentMessageId(event) !== null) {
        if (delivery.state === 'admitted')
          reconcile(projector, delivery, { entered: false, end: null, ops: [] });
      } else if (pending) {
        restorePending(store, delivery, event.message_id);
      } else if (delivery.state === 'admitted') {
        requeue(store, delivery, event);
      }
      continue;
    }
    if (delivery.state === 'admitted')
      reconcile(projector, delivery, projectDelivery(history.events, delivery.delivery_id));
  }
}

function reconcile(
  projector: ConversationProjector,
  delivery: HarnessDelivery,
  projection: DeliveryProjection,
): void {
  const { store } = projector.options.service;
  const event = store.assistantEvents.event(delivery.delivery_id);
  const completion = completionOf(projection);
  log.warn('reply.reconciled', {
    delivery_id: delivery.delivery_id,
    session_id: delivery.session_id,
    known: projection.end !== null,
    completed: completion.kind === 'completed' && !completion.interrupted,
    end_seq: projection.end?.seq ?? null,
    ops: projection.ops.length,
  });
  const outcome = { projection, completion };
  if (delivery.reply_id === null) settleDetached(projector, delivery, outcome);
  else replayReply(projector, { event, replyId: delivery.reply_id }, outcome);
  if (projection.end !== null)
    store.harnessDeliveries.cut(delivery.delivery_id, delivery.start_seq ?? 0, projection.end.seq);
}

interface Outcome {
  readonly projection: DeliveryProjection;
  readonly completion: NativeCompletion;
}

function replayReply(
  projector: ConversationProjector,
  target: { readonly event: StoredEvent; readonly replyId: string },
  { projection, completion }: Outcome,
): void {
  const { event, replyId } = target;
  const { store } = projector.options.service;
  const reply = store.assistantChat.message(replyId);
  const model = z.string().parse(reply.model);
  const saved = reply.embeds.find((embed) => embed.kind === 'chat_timeline');
  const timeline = saved === undefined ? undefined : CHAT_TIMELINE_EMBED.parse(saved);
  background(
    projector.start(event, store.aiChats.chat(event.chat_id), replyId, true),
    'turns.replay_failed',
  );
  const turn = projector.active.get(event.id);
  if (turn === undefined)
    throw new ApiError('conflict', 'The replayed native turn did not open a conversation stream.');
  projector.replay(turn, projection.ops, completion, {
    kept: reply.text,
    model,
    interruption: HUB_RESTARTED,
    ...(timeline === undefined ? {} : { timeline }),
  });
}

function settleDetached(
  projector: ConversationProjector,
  delivery: HarnessDelivery,
  { projection, completion }: Outcome,
): void {
  const { service, conversation, finished } = projector.options;
  const event = service.store.assistantEvents.event(delivery.delivery_id);
  const ok = completion.kind === 'completed' && !completion.interrupted;
  const failure = completionFailure(completion, false, HUB_RESTARTED);
  service.store.harnessDeliveries.update(
    delivery.delivery_id,
    projection.end === null ? 'unknown' : 'completed',
    () => {
      if (ok) conversation.stateOf(event.message_id, 'answered');
      else conversation.failedMessage(event.message_id, failure.reason, failure.code);
      finished(event, '', ok);
    },
  );
}

function requeue(store: Store, delivery: HarnessDelivery, event: StoredEvent): void {
  log.warn('reply.requeued', {
    delivery_id: delivery.delivery_id,
    session_id: delivery.session_id,
    chat_id: event.chat_id,
  });
  store.harnessDeliveries.requeue(delivery.delivery_id, () => {
    if (delivery.reply_id !== null) store.assistantChat.removeMessages([delivery.reply_id]);
    if (
      event.message_id !== null &&
      store.assistantChat.message(event.message_id).role === 'person'
    )
      store.assistantChat.updateMessage(event.message_id, {
        state: 'queued',
        reason: null,
        reason_code: null,
      });
  });
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

export function nativeReplyId(delivery: HarnessDelivery): string {
  if (delivery.reply_id === null)
    throw new ApiError('conflict', 'The admitted native reply was deleted and cannot be replayed.');
  return delivery.reply_id;
}
