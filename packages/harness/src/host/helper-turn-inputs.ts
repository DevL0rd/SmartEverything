import { z } from 'zod';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { helperInputId } from './helper-input';

const TURN = z.object({ turn: z.int() });
const TURN_QUEUE = z.object({
  target: z.literal('next-turn'),
  start: z.int().nonnegative(),
  removedCount: z.int().nonnegative().optional(),
  inserted: z.array(z.unknown()),
  outcome: z.literal('canceled').optional(),
});

interface Turn {
  readonly number: number;
  readonly directed: boolean;
  readonly expected: string | undefined;
}

function claimedDirectedInput(
  change: z.infer<typeof TURN_QUEUE>,
  removed: readonly (string | undefined)[],
): boolean {
  return (
    change.start === 0 &&
    removed.length === 1 &&
    removed[0] !== undefined &&
    change.inserted.length === 0 &&
    change.outcome === undefined
  );
}

function queueChange(
  pending: (string | undefined)[],
  turn: Turn | undefined,
  data: unknown,
): Turn | undefined {
  const queue = TURN_QUEUE.safeParse(data);
  if (!queue.success) return turn;
  const { start, removedCount, inserted } = queue.data;
  const removed = pending.splice(start, removedCount ?? 0, ...inserted.map(helperInputId));
  if (turn === undefined) return undefined;
  if (claimedDirectedInput(queue.data, removed))
    return { ...turn, directed: true, expected: undefined };
  return turn.expected !== undefined && removed.includes(turn.expected)
    ? { ...turn, expected: undefined }
    : turn;
}

function recordDirected(output: Set<number>, turn: Turn | undefined): void {
  if (turn !== undefined && (turn.directed || turn.expected !== undefined)) output.add(turn.number);
}

export function directedHelperTurns(events: readonly SessionEvent[]): ReadonlySet<number> {
  const pending: (string | undefined)[] = [];
  const directed = new Set<number>();
  let active: Turn | undefined;
  for (const event of events) {
    if (event.type === 'agent/inbox/spliced') active = queueChange(pending, active, event.data);
    if (
      event.type === 'user/message' &&
      active !== undefined &&
      helperInputId(event.data) !== undefined
    )
      active = { ...active, directed: true, expected: undefined };
    if (event.type === 'turn/start') {
      recordDirected(directed, active);
      active = { number: TURN.parse(event.data).turn, directed: false, expected: pending[0] };
    }
    if (event.type === 'turn/end' && active?.number === TURN.parse(event.data).turn) {
      recordDirected(directed, active);
      active = undefined;
    }
  }
  recordDirected(directed, active);
  return directed;
}
