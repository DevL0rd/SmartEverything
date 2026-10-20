import type {
  AutomationProgramRevisionSummary,
  AutomationRowV3,
  AutomationRunSummary,
  AutomationV3,
  FunctionLookup,
  NodeKind,
  RefNames,
} from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import {
  REF_SLOTS,
  manifestOf,
  type CalleeRef,
  type Manifest,
  type ResolvePlan,
} from '@smarteverything/flow/compile/manifest';
import { chartSummary, newestFirst, type ChartSummary } from '../runs/run-history-model';

export const ACTIVITY_DAYS = 30;
export const RECENT_RUNS = 5;

export type UseSlot = (typeof REF_SLOTS)[number];

export type KindOf = (id: string) => NodeKind | undefined;

export function statusLine(row: Pick<AutomationRowV3, 'enabled' | 'revision' | 'draft'>): string {
  return [
    row.enabled ? 'Live' : 'Paused',
    `revision ${String(row.revision)}`,
    ...(row.draft === null ? [] : ['draft has changes']),
  ].join(' · ');
}

export interface Activity {
  readonly summary: ChartSummary;
  readonly recent: readonly AutomationRunSummary[];
  readonly mostSteps: number;
}

export function activityOf(
  runs: readonly AutomationRunSummary[],
  now: number,
  timeZone: string | null,
): Activity {
  const recent = newestFirst([...runs]).slice(0, RECENT_RUNS);
  return {
    summary: chartSummary(
      runs.filter((run) => run.mode === 'live'),
      now,
      timeZone,
      ACTIVITY_DAYS,
    ),
    recent,
    mostSteps: Math.max(0, ...recent.map((run) => run.steps)),
  };
}

function resolverOf(kinds: KindOf, functions: FunctionLookup): ResolvePlan {
  return (callee: CalleeRef) => {
    const body = functions(callee.fn, callee.pin);
    if (body === undefined) return undefined;
    const lowered = lower(body, { kinds });
    return lowered.ok ? lowered.plan : undefined;
  };
}

export function manifestFor(
  program: AutomationV3,
  kinds: KindOf,
  functions: FunctionLookup,
): Manifest | null {
  const lowered = lower(program, { kinds });
  if (!lowered.ok) return null;
  return manifestOf(lowered.plan, (id) => kinds(id), resolverOf(kinds, functions));
}

const SLOT_TITLES: Readonly<Record<UseSlot, string>> = {
  device: 'Devices',
  room: 'Rooms',
  group: 'Groups',
  scene: 'Scenes',
  person: 'People',
  computer: 'Computers',
  phone: 'Phones',
  camera: 'Cameras',
  chat: 'Chats',
  value: 'Variables',
  automation: 'Automations',
  function: 'Custom Nodes',
  secret: 'Secrets',
};

const SLOT_REMOVED: Readonly<Record<UseSlot, string>> = {
  device: 'A removed device',
  room: 'A removed room',
  group: 'A removed group',
  scene: 'A removed scene',
  person: 'A removed person',
  computer: 'A removed computer',
  phone: 'A removed phone',
  camera: 'A removed camera',
  chat: 'A removed chat',
  value: 'A removed variable',
  automation: 'A removed automation',
  function: 'A removed Custom Node',
  secret: 'A removed secret',
};

export interface UseChip {
  readonly slot: UseSlot;
  readonly id: string;
  readonly label: string;
}

export interface UseGroup {
  readonly slot: UseSlot;
  readonly title: string;
  readonly chips: readonly UseChip[];
}

export function usageGroups(manifest: Manifest, names: RefNames): readonly UseGroup[] {
  return REF_SLOTS.flatMap((slot): readonly UseGroup[] => {
    const ids = manifest.uses[slot];
    if (ids.length === 0) return [];
    const chips = ids.map((id) => ({
      slot,
      id,
      label: names(slot, id) ?? SLOT_REMOVED[slot],
    }));
    return [{ slot, title: SLOT_TITLES[slot], chips }];
  });
}

export function dynamicUsage(manifest: Manifest): readonly string[] {
  return REF_SLOTS.filter((slot) => manifest.dynamic.includes(slot)).map((slot) =>
    SLOT_TITLES[slot].toLowerCase(),
  );
}

export interface VersionRow {
  readonly revision: number;
  readonly savedAt: string;
  readonly by: string;
  readonly live: boolean;
}

export type PersonName = (profileId: string) => string | null;

export function authorLabel(
  author: AutomationProgramRevisionSummary['author'],
  person: PersonName,
): string {
  if (author === null) return 'Unknown author';
  if (author.via === 'assistant') return 'The assistant';
  return person(author.profile_id) ?? 'A household member';
}

export function versionRows(
  revisions: readonly AutomationProgramRevisionSummary[],
  live: number,
  person: PersonName,
): readonly VersionRow[] {
  return [...revisions]
    .sort((left, right) => right.revision - left.revision)
    .map((entry) => ({
      revision: entry.revision,
      savedAt: entry.saved_at,
      by: authorLabel(entry.author, person),
      live: entry.revision === live,
    }));
}
