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
import type { HostStore } from '../../../store/host/host-store';
import type { HarnessDelivery } from '../../../store/repositories/harness-deliveries';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { helperParentMessageId } from '../../delegation/helper-delivery';
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
  readonly metadata: NonNullable<Awaited<ReturnType<HostStore['dshSessions']['stat']>>>;
  readonly events: ReturnType<typeof readNativeHistory>;
}

async function deliveryHistory(
  store: Store,
  delivery: HarnessDelivery,
  event: StoredEvent,
): Promise<DeliveryHistory> {
  const metadata = await store.host.call(
    'dshSessions',
    'stat',
    delivery.session_id,
    event.profile_id,
  );
  if (metadata?.chat_id !== event.chat_id)
    throw new ApiError('forbidden', 'Retained delivery/native conversation binding differs.');
  const records = await store.host.call(
    'dshSessions',
    'readAll',
    delivery.session_id,
    event.profile_id,
  );
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

export async function reconcileNativeReplies(
  projector: ConversationProjector,
  pendingInput?: (input: NativeInputHistory) => readonly string[],
): Promise<void> {
  const { store } = projector.options.service;
  for (const delivery of await store.host.call('harnessDeliveries', 'unsettled')) {
    const event = await store.host.call('assistantEvents', 'event', delivery.delivery_id);
    const history = await deliveryHistory(store, delivery, event);
    const received = history.events.some(
      (record) =>
        record.type === 'user/message' && nativeInputId(record.data) === delivery.delivery_id,
    );
    const pending = pendingInput?.(history).includes(delivery.delivery_id) === true;
    if (!received) {
      if (helperParentMessageId(event) !== null) {
        if (delivery.state === 'admitted')
          await reconcile(projector, { delivery, event }, { entered: false, end: null, ops: [] });
      } else if (pending) {
        await restorePending(store, delivery, event.message_id);
      } else if (delivery.state === 'admitted') {
        await requeue(store, delivery, event);
      }
      continue;
    }
    if (delivery.state === 'admitted')
      await reconcile(
        projector,
        { delivery, event },
        projectDelivery(history.events, delivery.delivery_id),
      );
  }
}

interface Replayed {
  readonly delivery: HarnessDelivery;
  readonly event: StoredEvent;
}

async function reconcile(
  projector: ConversationProjector,
  { delivery, event }: Replayed,
  projection: DeliveryProjection,
): Promise<void> {
  const { store } = projector.options.service;
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
  if (delivery.reply_id === null) await settleDetached(projector, { delivery, event }, outcome);
  else await replayReply(projector, { event, replyId: delivery.reply_id }, outcome);
  if (projection.end !== null)
    await store.host.call(
      'harnessDeliveries',
      'cut',
      delivery.delivery_id,
      delivery.start_seq ?? 0,
      projection.end.seq,
    );
}

interface Outcome {
  readonly projection: DeliveryProjection;
  readonly completion: NativeCompletion;
}

async function replayReply(
  projector: ConversationProjector,
  target: { readonly event: StoredEvent; readonly replyId: string },
  { projection, completion }: Outcome,
): Promise<void> {
  const { event, replyId } = target;
  const { store } = projector.options.service;
  const reply = await store.host.call('assistantChat', 'message', replyId);
  const model = z.string().parse(reply.model);
  const saved = reply.embeds.find((embed) => embed.kind === 'chat_timeline');
  const timeline = saved === undefined ? undefined : CHAT_TIMELINE_EMBED.parse(saved);
  const chat = await store.host.call('aiChats', 'chat', event.chat_id);
  background(projector.start(event, chat, replyId, true), 'turns.replay_failed');
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

async function settleDetached(
  projector: ConversationProjector,
  { delivery, event }: Replayed,
  { projection, completion }: Outcome,
): Promise<void> {
  const { service, finished } = projector.options;
  const ok = completion.kind === 'completed' && !completion.interrupted;
  const failure = completionFailure(completion, false, HUB_RESTARTED);
  await service.store.host.write('nativeReplaySettle', {
    deliveryId: delivery.delivery_id,
    state: projection.end === null ? 'unknown' : 'completed',
    op: ok
      ? { kind: 'state', messageId: event.message_id, state: 'answered', reason: null }
      : {
          kind: 'failedMessage',
          messageId: event.message_id,
          reason: failure.reason,
          code: failure.code,
        },
  });
  finished(event, ok ? '' : failure.reason, ok);
}

async function requeue(store: Store, delivery: HarnessDelivery, event: StoredEvent): Promise<void> {
  log.warn('reply.requeued', {
    delivery_id: delivery.delivery_id,
    session_id: delivery.session_id,
    chat_id: event.chat_id,
  });
  await store.host.write('nativeReplayRequeue', {
    deliveryId: delivery.delivery_id,
    replyId: delivery.reply_id,
    messageId: event.message_id,
  });
}

async function restorePending(
  store: Store,
  delivery: HarnessDelivery,
  messageId: string | null,
): Promise<void> {
  await store.host.write('nativeReplayRestore', {
    deliveryId: delivery.delivery_id,
    replyId: delivery.reply_id,
    messageId,
  });
}

export function nativeReplyId(delivery: HarnessDelivery): string {
  if (delivery.reply_id === null)
    throw new ApiError('conflict', 'The admitted native reply was deleted and cannot be replayed.');
  return delivery.reply_id;
}
