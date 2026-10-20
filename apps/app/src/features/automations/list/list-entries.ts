import {
  automationSentence,
  programReferenceIds,
  type AutomationRowV3,
  type DescribeContext,
  type ReferenceContext,
} from '@smarteverything/domain';
import { activeTriggers } from '../model/consumers/row';
import { timedTriggersOf } from '../model/consumers/week-schedule';
import { NO_STATS, type RunStats } from './run-stats';

export type SectionId = 'attention' | 'running' | 'scheduled' | 'events' | 'called' | 'paused';
export type ChipId = 'draft' | 'update' | 'assistant';

export const SECTION_ORDER: readonly SectionId[] = [
  'attention',
  'running',
  'scheduled',
  'events',
  'called',
  'paused',
];

export const SECTION_TITLES: Readonly<Record<SectionId, string>> = {
  attention: 'Needs attention',
  running: 'Running now',
  scheduled: 'Scheduled',
  events: 'On events',
  called: 'Called by others',
  paused: 'Paused',
};

export const CHIP_LABELS: Readonly<Record<ChipId, string>> = {
  draft: 'Draft changes',
  update: 'Update available',
  assistant: 'Assistant',
};

export interface ListEntry {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly sentence: string | null;
  readonly leadKind: string | null;
  readonly section: SectionId;
  readonly chips: readonly ChipId[];
  readonly rooms: readonly string[];
  readonly stats: RunStats;
  readonly lastError: string | null;
  readonly lastRunAt: string | null;
  readonly runCount: number;
  readonly updatedAt: string;
  readonly revision: number;
}

export interface ListContext {
  readonly describe: DescribeContext;
  readonly references: ReferenceContext;
  readonly rooms: ReadonlyMap<string, string>;
  readonly updates: ReadonlySet<string>;
}

const CALLED = 'trigger.called';

function sectionOf(row: AutomationRowV3, stats: RunStats): SectionId {
  const triggers = activeTriggers(row.definition);
  if (row.last_error !== null) return 'attention';
  if (!row.enabled) return 'paused';
  if (stats.active > 0) return 'running';
  if (timedTriggersOf(row.definition).length > 0) return 'scheduled';
  if (triggers.length > 0 && triggers.every((trigger) => trigger.kind === CALLED)) return 'called';
  return 'events';
}

function chipsOf(row: AutomationRowV3, updates: ReadonlySet<string>): readonly ChipId[] {
  return [
    ...(row.draft === null ? [] : (['draft'] as const)),
    ...(updates.has(row.id) ? (['update'] as const) : []),
    ...(row.author?.via === 'assistant' ? (['assistant'] as const) : []),
  ];
}

export function entryOf(row: AutomationRowV3, stats: RunStats, context: ListContext): ListEntry {
  const referenced = programReferenceIds(row.definition, context.references);
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    sentence: automationSentence(row.definition, context.describe),
    leadKind: activeTriggers(row.definition)[0]?.kind ?? null,
    section: sectionOf(row, stats),
    chips: chipsOf(row, context.updates),
    rooms: [...referenced].filter((id) => context.rooms.has(id)),
    stats,
    lastError: row.last_error,
    lastRunAt: row.last_run_at,
    runCount: row.run_count,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

export function entriesOf(
  rows: readonly AutomationRowV3[],
  stats: ReadonlyMap<string, RunStats>,
  context: ListContext,
): readonly ListEntry[] {
  return rows.map((row) => entryOf(row, stats.get(row.id) ?? NO_STATS, context));
}

export function sameEntry(a: ListEntry, b: ListEntry): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
