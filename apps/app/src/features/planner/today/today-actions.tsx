import type { PlannerDay, PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { createContext, use, useState, type ReactNode } from 'react';
import { notify } from '../../../components/toast-store';
import { dayBoundsOf } from '../../../format/time';
import {
  usePlannerItems,
  usePlannerTools,
  usePlannerWrites,
  type PlannerTools,
  type PlannerWrites,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';

const MINUTE_MS = 60_000;
const ANY_LENGTH_MINUTES = 1;

export interface OccurrenceActions {
  readonly done: (key: string, occurrence: PlannerOccurrenceView) => void;
  readonly skip: (key: string, occurrence: PlannerOccurrenceView) => void;
  readonly later: (key: string, occurrence: PlannerOccurrenceView) => void;
}

export interface TodayActionsValue {
  readonly hidden: ReadonlySet<string>;
  readonly actions: OccurrenceActions;
}

const TodayActionsContext = createContext<TodayActionsValue | null>(null);

class OutsideTodayActions extends Error {
  constructor() {
    super('This part of Today only works inside the Today actions provider.');
  }
}

export function useTodayActions(): TodayActionsValue {
  const value = use(TodayActionsContext);
  if (value === null) throw new OutsideTodayActions();
  return value;
}

function momentOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function lengthMinutesOf(
  occurrence: PlannerOccurrenceView,
  item: PlannerItemRow | undefined,
): number {
  const start = momentOf(occurrence.start);
  const end = momentOf(occurrence.end);
  if (start !== null && end !== null)
    return Math.max(ANY_LENGTH_MINUTES, (end - start) / MINUTE_MS);
  return item?.estimate_minutes ?? ANY_LENGTH_MINUTES;
}

class NoFreeTimeToday extends Error {
  constructor() {
    super('No free time is left today.');
  }
}

async function moveLater(
  input: {
    readonly occurrence: PlannerOccurrenceView;
    readonly item: PlannerItemRow | undefined;
    readonly day: PlannerDay;
  },
  tools: PlannerTools,
  writes: PlannerWrites,
): Promise<void> {
  const { occurrence, item, day } = input;
  const minutes = Math.ceil(lengthMinutesOf(occurrence, item));
  const from = new Date().toISOString();
  const to = new Date(dayBoundsOf(day.date, day.time_zone).end).toISOString();
  const [slot] = await tools.freeSlots({ from, to, minutes });
  if (slot === undefined) throw new NoFreeTimeToday();
  const sized = occurrence.end !== null || (item?.estimate_minutes ?? null) !== null;
  await writes.moveItem(occurrence.item_id, {
    occurrence_key: occurrence.occurrence_key,
    start: slot.from,
    end: sized ? new Date(Date.parse(slot.from) + minutes * MINUTE_MS).toISOString() : null,
  });
}

function useHiddenKeys(): readonly [ReadonlySet<string>, (key: string, hidden: boolean) => void] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hide = (key: string, gone: boolean): void => {
    setHidden(
      (current) =>
        new Set(gone ? [...current, key] : [...current].filter((entry) => entry !== key)),
    );
  };
  return [hidden, hide];
}

function useOccurrenceActions(
  day: PlannerDay,
  hide: (key: string, hidden: boolean) => void,
): OccurrenceActions {
  const { person } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  const tools = usePlannerTools(person);
  const items = usePlannerItems(person);
  const run = (key: string, failure: string, work: () => Promise<unknown>): void => {
    hide(key, true);
    background(
      work().catch((error: unknown) => {
        hide(key, false);
        notify({ message: failure, error, tone: 'critical' });
      }),
      'planner.today_action_failed',
    );
  };
  return {
    done: (key, occurrence): void => {
      run(key, 'Couldn’t mark that done', () =>
        writes.completeItem(occurrence.item_id, { occurrence_key: occurrence.occurrence_key }),
      );
    },
    skip: (key, occurrence): void => {
      run(key, 'Couldn’t skip that', () =>
        writes.skipItem(occurrence.item_id, occurrence.occurrence_key),
      );
    },
    later: (key, occurrence): void => {
      const item = items.find((row) => row.id === occurrence.item_id);
      run(key, 'Couldn’t move that to later', () =>
        moveLater({ occurrence, item, day }, tools, writes),
      );
    },
  };
}

export function TodayActions({
  day,
  children,
}: {
  readonly day: PlannerDay;
  readonly children: ReactNode;
}): ReactNode {
  const [hidden, hide] = useHiddenKeys();
  const actions = useOccurrenceActions(day, hide);
  return <TodayActionsContext value={{ hidden, actions }}>{children}</TodayActionsContext>;
}
