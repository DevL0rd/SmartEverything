import { helperDialogueOf, type AssistantMessageRow } from '@smarteverything/domain';
import { isWorking, workStatusOf, workText, type Turn } from '../../../store/chat-turns';
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

export interface FeedbackInput {
  readonly rows: readonly AssistantMessageRow[];
  readonly turn: Turn | null;
  readonly sending: boolean;
  readonly online: boolean;
  readonly provider: TurnFeedback | null;
}

function activeFeedback(input: FeedbackInput, turn: Turn): TurnFeedback {
  if (!input.online || turn.behind) return { label: RECONNECTING_LABEL, moving: true };
  if (input.provider !== null) return input.provider;
  return { label: `${workText(workStatusOf(turn))}…`, moving: true };
}

function latestRequest(rows: readonly AssistantMessageRow[]): AssistantMessageRow | undefined {
  return [...rows]
    .sort((left, right) => compareText(left.created_at, right.created_at))
    .findLast(
      (row) => helperDialogueOf(row) === undefined && row.role === 'person' && row.kind === 'text',
    );
}

export function turnFeedback(input: FeedbackInput): TurnFeedback | null {
  if (input.sending) return { label: 'Sending…', moving: input.online };
  if (input.turn !== null && isWorking(input.turn)) return activeFeedback(input, input.turn);
  return latestRequest(input.rows)?.state === 'queued' ? { label: 'Queued', moving: false } : null;
}
