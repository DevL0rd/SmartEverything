import type { AssistantMessageRow } from '@smarteverything/domain';
import { runStatsOf, type TurnStats } from '../model/chat-display';
import { costPeakOf } from '../model/cost-note';

interface RunItem {
  readonly row: AssistantMessageRow;
  readonly position: string;
  readonly stats: TurnStats | null;
  readonly costPeak: number | null;
}

function runsOf<T extends RunItem>(items: readonly T[]): readonly (readonly T[])[] {
  const runs: T[][] = [];
  let previous: AssistantMessageRow | null = null;
  for (const item of items) {
    const opens = item.row !== previous && (item.position === 'first' || item.position === 'only');
    const last = runs.at(-1);
    if (opens || last === undefined) runs.push([item]);
    else last.push(item);
    previous = item.row;
  }
  return runs;
}

function rowsOf(run: readonly RunItem[]): readonly AssistantMessageRow[] {
  return [...new Set(run.map((item) => item.row))];
}

export function withTurnStats<T extends RunItem>(items: readonly T[]): readonly T[] {
  const runs = runsOf(items).map((run) => ({ run, stats: runStatsOf(rowsOf(run)) }));
  const costPeak = costPeakOf(runs.map(({ stats }) => stats.cost));
  return runs.flatMap(({ run, stats }) =>
    run.map((item, index) => ({
      ...item,
      stats: index === run.length - 1 ? stats : null,
      costPeak,
    })),
  );
}
