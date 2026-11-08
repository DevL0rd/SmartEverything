import { type AssistantMessageRow } from '@smarteverything/domain';
import { noCostReported, type CostFields } from './cost-note';
import { replyTimeline } from './reply-timeline';

export const CHAT_RHYTHM = {
  betweenRuns: 16,
  insideRun: 4,
  ownRun: 2,
  betweenBlocks: 8,
  metaAbove: 3,
  metaHeight: 16,
  groupAvatar: 24,
  groupGap: 8,
} as const;

export const GROUP_GUTTER = CHAT_RHYTHM.groupAvatar + CHAT_RHYTHM.groupGap;

export function activityExpanded(live: boolean): boolean {
  return live;
}

export interface TurnStats {
  readonly durationMs: number | null;
  readonly tools: number;
  readonly cost: CostFields;
}

function settled(row: AssistantMessageRow): boolean {
  return row.role === 'responder' && row.state !== 'working';
}

function elapsedOf(row: AssistantMessageRow): number {
  if (!settled(row)) return 0;
  return Math.max(0, Date.parse(row.updated_at) - Date.parse(row.created_at));
}

function toolsOf(row: AssistantMessageRow): number {
  if (!settled(row)) return 0;
  const timeline = replyTimeline(row);
  if (timeline === null) return row.steps.length;
  return timeline.parts.filter((part) => part.kind === 'tool').length;
}

function costOf(rows: readonly AssistantMessageRow[]): CostFields {
  const micros = rows.reduce((sum, row) => sum + row.cost_micros, 0);
  const gaps = rows.some(
    (row) => row.cost_incomplete === true || (micros > 0 && noCostReported(row)),
  );
  return {
    model: rows.findLast((row) => row.model !== null)?.model ?? null,
    cost_micros: micros,
    cost_incomplete: gaps,
  };
}

export function runStatsOf(rows: readonly AssistantMessageRow[]): TurnStats {
  const durationMs = rows.reduce((sum, row) => sum + elapsedOf(row), 0);
  return {
    durationMs: durationMs > 0 ? durationMs : null,
    tools: rows.reduce((sum, row) => sum + toolsOf(row), 0),
    cost: costOf(rows),
  };
}

function toolsText(tools: number): string {
  return tools === 1 ? '1 tool' : `${String(tools)} tools`;
}

export function replyStatsOf(
  turn: {
    readonly group: boolean;
    readonly state: AssistantMessageRow['state'];
    readonly stopped: boolean;
    readonly stats: TurnStats;
  },
  time: string,
  duration: (ms: number) => string,
): readonly string[] {
  const { stats } = turn;
  const timed = !turn.group && (turn.state !== 'failed' || turn.stopped);
  return [
    ...(timed ? [time] : []),
    ...(stats.tools === 0 ? [] : [toolsText(stats.tools)]),
    ...(stats.durationMs === null ? [] : [duration(stats.durationMs)]),
  ];
}
