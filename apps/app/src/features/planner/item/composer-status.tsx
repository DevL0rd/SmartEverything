import type { PlannerCollectionRow } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PlannerParse } from '../../../api/planner';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { usePlannerPreferences, type PlannerPerson } from '../data';
import {
  willAddOf,
  type ChipContext,
  type ComposerKind,
  type ComposerPlan,
  type WillAddChip,
} from './parse-preview';

const log = new Logger('app.planner');

export interface Status {
  readonly text: string | null;
  readonly problem: boolean;
  readonly detail: string | null;
  readonly retry: (() => void) | null;
  readonly asTask: (() => void) | null;
}

export function StatusLine({ status }: { readonly status: Status }): ReactNode {
  const { detail } = status;
  useEffect(() => {
    if (detail !== null) log.warn('planner.parse_failed', { detail });
  }, [detail]);
  if (status.text === null) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Text
        variant="footnote"
        tone={status.problem ? 'warning' : 'variant'}
        accessibilityLiveRegion="polite"
        className="tabular min-w-0 shrink"
      >
        {status.text}
      </Text>
      {status.retry === null ? null : (
        <Button label="Try again" icon="refresh" variant="text" onPress={status.retry} />
      )}
      {status.asTask === null ? null : (
        <Button label="Add as a task instead" variant="text" onPress={status.asTask} />
      )}
    </View>
  );
}

interface StatusInput {
  readonly plan: ComposerPlan | null;
  readonly problem: string | null;
  readonly next: string | null;
  readonly kind: ComposerKind;
  readonly retry: () => void;
  readonly choose: (kind: ComposerKind) => void;
}

export function statusOf({ plan, problem, next, kind, retry, choose }: StatusInput): Status {
  const asTask =
    kind === 'event' && (problem !== null || plan?.kind === 'missing')
      ? (): void => {
          choose('task');
        }
      : null;
  if (problem !== null) {
    return { text: 'Couldn’t read that.', problem: true, detail: problem, retry, asTask };
  }
  if (plan?.kind === 'missing') {
    return { text: plan.reason, problem: true, detail: null, retry: null, asTask };
  }
  return { text: next, problem: false, detail: null, retry: null, asTask: null };
}

export function chipsOf(
  kind: ComposerKind,
  plan: ComposerPlan | null,
  parsed: PlannerParse | null,
  context: ChipContext,
): readonly WillAddChip[] {
  if (plan === null) return [];
  if (plan.kind === 'missing' && parsed !== null && (kind === 'task' || kind === 'event')) {
    return willAddOf({ kind: 'item', body: parsed.draft }, parsed, context);
  }
  return willAddOf(plan, parsed, context);
}

export function plainCollectionOf(
  collections: readonly PlannerCollectionRow[],
  preferred: string | null,
): PlannerCollectionRow | null {
  return (
    collections.find((row) => row.id === preferred) ??
    collections.find((row) => row.kind === 'list') ??
    collections[0] ??
    null
  );
}

export function plainTaskOf(title: string, collectionId: string): ComposerPlan {
  return {
    kind: 'item',
    body: {
      collection_id: collectionId,
      kind: 'task',
      title,
      parent_id: null,
      notes: '',
      location: null,
      priority: null,
      tags: [],
      estimate_minutes: null,
      start_local: null,
      end_local: null,
      time_zone: null,
      all_day: false,
      due_date: null,
      due_at: null,
      rrule: null,
      exdates: [],
      completion: { kind: 'manual' },
      attachments: [],
      reminders: [],
      assignee_id: null,
    },
  };
}

export interface FallbackInput {
  readonly person: PlannerPerson;
  readonly collections: readonly PlannerCollectionRow[];
  readonly problem: string | null;
  readonly kind: ComposerKind;
  readonly text: string;
  readonly collectionId?: string;
}

export function useFallbackPlan(input: FallbackInput): ComposerPlan | null {
  const preferred = usePlannerPreferences(input.person).data?.tasks.default_collection_id;
  const title = input.text.trim();
  if (input.problem === null || input.kind !== 'task' || title === '') return null;
  const plain = plainCollectionOf(input.collections, input.collectionId ?? preferred ?? null);
  return plain === null ? null : plainTaskOf(title, plain.id);
}
