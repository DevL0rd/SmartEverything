import type {
  AssistantMessageRow,
  AssistantReasonCode,
  SettledStep,
} from '@smarteverything/domain';
import { hostErrorOf } from '../store/host/errors';
import type { HostError } from '../store/host/protocol';
import { durableStoreUnit, storeUnit } from '../store/host/unit';
import type { HarnessDelivery } from '../store/repositories/harness-deliveries';
import type { HostStore } from '../store/host/host-store';
import {
  applyReplyOp,
  savedSources,
  startedReply,
  type ReplyOp,
  type ReplyStart,
} from './reply-records';
import { addConversationMessage } from './store-units';

export type ReplyOutcome =
  | { readonly ok: true; readonly value: AssistantMessageRow | null }
  | { readonly ok: false; readonly error: HostError };

function replyWrites(
  store: HostStore,
  input: { readonly ops: readonly ReplyOp[] },
): ReplyOutcome[] {
  return input.ops.map((op) => {
    try {
      return { ok: true, value: applyReplyOp(store, op) };
    } catch (cause) {
      return { ok: false, error: hostErrorOf(cause) };
    }
  });
}

function replyStart(
  store: HostStore,
  start: ReplyStart & { readonly id?: string },
): AssistantMessageRow {
  return addConversationMessage(store, {
    row: startedReply(store, start),
    files: [],
    ...(start.id === undefined ? {} : { messageId: start.id }),
  });
}

export interface NativeAdmission {
  readonly deliveryId: string;
  readonly sessionId: string;
  readonly start: ReplyStart;
}

function nativeAdmit(store: HostStore, input: NativeAdmission): HarnessDelivery {
  return store.harnessDeliveries.admit(
    input.deliveryId,
    input.sessionId,
    () => replyStart(store, input.start).id,
  );
}

export type NativeReplyResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly model: string;
      readonly steps: readonly SettledStep[];
    }
  | {
      readonly ok: false;
      readonly text: string;
      readonly reason: string;
      readonly code: AssistantReasonCode;
      readonly steps: readonly SettledStep[];
    };

export interface NativeCompletionRecord {
  readonly deliveryId: string;
  readonly outcome: HarnessDelivery['state'];
  readonly replyId: string;
  readonly messageId: string | null;
  readonly result: NativeReplyResult;
}

function nativeComplete(store: HostStore, input: NativeCompletionRecord): void {
  const { result } = input;
  store.harnessDeliveries.update(input.deliveryId, input.outcome, () => {
    if (result.ok) {
      applyReplyOp(store, {
        kind: 'finish',
        id: input.replyId,
        text: result.text,
        done: {
          model: result.model,
          steps: result.steps,
          sources: savedSources(store, input.replyId),
        },
      });
      applyReplyOp(store, {
        kind: 'state',
        messageId: input.messageId,
        state: 'answered',
        reason: null,
      });
    } else {
      applyReplyOp(store, {
        kind: 'fail',
        id: input.replyId,
        failure: { text: result.text, reason: result.reason, code: result.code },
        steps: result.steps,
      });
      applyReplyOp(store, {
        kind: 'failedMessage',
        messageId: input.messageId,
        reason: result.reason,
        code: result.code,
      });
    }
    store.assistantEvents.mark(input.deliveryId, 'answered_at');
  });
}

export const REPLY_WRITE_UNIT = storeUnit(replyWrites);
export const REPLY_START_UNIT = storeUnit(replyStart);
export const NATIVE_ADMIT_UNIT = durableStoreUnit(nativeAdmit);
export const NATIVE_COMPLETE_UNIT = durableStoreUnit(nativeComplete);
