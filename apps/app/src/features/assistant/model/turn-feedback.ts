import { CHAT_RETRYING_REASON, type AssistantMessageRow } from '@smarteverything/domain';
import type { Turn } from '../../../store/chat-turns';
import { compareText } from '../../../format/text';

export interface TurnFeedback {
  readonly label: string;
  readonly moving: boolean;
}

export const RECONNECTING_LABEL = 'Reconnecting…';

export const RETRYING_LABEL = 'Retrying…';

export const SWITCHING_LABEL = 'Switching machine…';

export const APPROVAL_LABEL = 'Waiting for approval';

export const ANSWER_LABEL = 'Waiting for your answer';

const NEEDS_YOU_LABELS: readonly string[] = [APPROVAL_LABEL, ANSWER_LABEL];

export type FeedbackKind = 'needs-you' | 'switching' | 'reconnecting';

export function feedbackKind(feedback: TurnFeedback | null): FeedbackKind | null {
  if (feedback === null) return null;
  if (feedback.label === RECONNECTING_LABEL) return 'reconnecting';
  if (feedback.label === SWITCHING_LABEL) return 'switching';
  return NEEDS_YOU_LABELS.includes(feedback.label) ? 'needs-you' : null;
}

export function feedbackTone(feedback: TurnFeedback): 'critical' | 'variant' {
  return feedbackKind(feedback) === 'reconnecting' ? 'critical' : 'variant';
}

export interface FeedbackInput {
  readonly rows: readonly AssistantMessageRow[];
  readonly turn: Turn | null;
  readonly sending: boolean;
  readonly online: boolean;
  readonly provider: TurnFeedback | null;
}

function requestPending(request: AssistantMessageRow): boolean {
  return ['queued', 'delivered', 'working'].includes(request.state ?? '');
}

function latestReply(
  rows: readonly AssistantMessageRow[],
  request: AssistantMessageRow | undefined,
): AssistantMessageRow | undefined {
  return rows.findLast(
    (row) =>
      row.role === 'responder' &&
      row.kind === 'text' &&
      (request === undefined ||
        row.reply_to === request.id ||
        (row.reply_to === null && row.created_at >= request.created_at)),
  );
}

function historyPending(
  request: AssistantMessageRow | undefined,
  reply: AssistantMessageRow | undefined,
): boolean {
  if (reply !== undefined && reply.state !== 'working') return false;
  if (request === undefined) return reply !== undefined;
  if (reply !== undefined && reply.reply_to !== request.id) return true;
  return requestPending(request);
}

function workLabel(turn: Turn | null, reply: AssistantMessageRow | undefined): string {
  if (turn?.state === 'thinking') return 'Thinking…';
  if (reply !== undefined || turn?.state === 'tool' || turn?.state === 'replying')
    return 'Working…';
  return 'Waiting for response…';
}

function turnStopped(turn: Turn | null): boolean {
  return turn?.state === 'failed' || turn?.state === 'idle';
}

function retryFeedback(turn: Turn | null): TurnFeedback | null {
  return turn?.state === 'thinking' && turn.reason === CHAT_RETRYING_REASON
    ? { label: RETRYING_LABEL, moving: true }
    : null;
}

function activeFeedback(
  input: FeedbackInput,
  request: AssistantMessageRow | undefined,
  reply: AssistantMessageRow | undefined,
): TurnFeedback | null {
  if (turnStopped(input.turn)) return null;
  if (!input.online || input.turn?.behind === true)
    return { label: RECONNECTING_LABEL, moving: true };
  const retry = retryFeedback(input.turn);
  if (retry !== null) return retry;
  if (request?.state === 'queued') return { label: 'Queued', moving: false };
  if (input.provider !== null) return input.provider;
  return { label: workLabel(input.turn, reply), moving: true };
}

function relatedTurn(
  turn: Turn | null,
  request: AssistantMessageRow | undefined,
  reply: AssistantMessageRow | undefined,
): Turn | null {
  if (turn === null) return null;
  if (turn.messageId === null) return turnStopped(turn) ? null : turn;
  const messageId = request?.id ?? reply?.reply_to;
  return turn.messageId === messageId || turn.messageId === reply?.id ? turn : null;
}

function observedFeedback(input: FeedbackInput): TurnFeedback | null {
  if (input.rows.length > 0 || turnStopped(input.turn)) return null;
  if (input.turn === null && input.provider === null) return null;
  return activeFeedback(input, undefined, undefined);
}

export function turnFeedback(input: FeedbackInput): TurnFeedback | null {
  if (input.sending) return { label: 'Sending…', moving: input.online };
  const rows = [...input.rows].sort((left, right) =>
    compareText(left.created_at, right.created_at),
  );
  const request = rows.findLast((row) => row.role === 'person' && row.kind === 'text');
  const reply = latestReply(rows, request);
  if (request === undefined && reply === undefined) return observedFeedback(input);
  if (!historyPending(request, reply)) return null;
  const owner = reply?.reply_to === null ? undefined : request;
  return activeFeedback({ ...input, turn: relatedTurn(input.turn, owner, reply) }, owner, reply);
}
