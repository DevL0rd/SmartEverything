import { durableStoreUnit } from '../../../store/host/unit';
import type { HarnessDelivery } from '../../../store/repositories/harness-deliveries';
import type { Store } from '../../../store/store';
import { applyReplyOp, type ReplyOp } from '../../reply-records';

export interface ReplaySettle {
  readonly deliveryId: string;
  readonly state: HarnessDelivery['state'];
  readonly op: ReplyOp;
}

export interface ReplayRows {
  readonly deliveryId: string;
  readonly replyId: string | null;
  readonly messageId: string | null;
}

function settle(store: Store, input: ReplaySettle): void {
  store.harnessDeliveries.update(input.deliveryId, input.state, () => {
    applyReplyOp(store, input.op);
  });
}

function requeue(store: Store, input: ReplayRows): void {
  store.harnessDeliveries.requeue(input.deliveryId, () => {
    if (input.replyId !== null) store.assistantChat.removeMessages([input.replyId]);
    if (input.messageId !== null && store.assistantChat.message(input.messageId).role === 'person')
      store.assistantChat.updateMessage(input.messageId, {
        state: 'queued',
        reason: null,
        reason_code: null,
      });
  });
}

function restorePending(store: Store, input: ReplayRows): void {
  store.harnessDeliveries.restorePending(input.deliveryId, () => {
    if (input.messageId !== null)
      store.assistantChat.updateMessage(input.messageId, {
        state: 'delivered',
        reason: null,
        reason_code: null,
      });
    if (input.replyId !== null)
      store.assistantChat.updateMessage(input.replyId, {
        state: 'working',
        reason: null,
        reason_code: null,
      });
  });
}

export const REPLAY_SETTLE_UNIT = durableStoreUnit(settle);
export const REPLAY_REQUEUE_UNIT = durableStoreUnit(requeue);
export const REPLAY_RESTORE_UNIT = durableStoreUnit(restorePending);
