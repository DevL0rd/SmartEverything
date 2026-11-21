import type { PlannerDay, PlannerItemRow, PlannerOccurrenceView } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useContext, useState, type ReactNode } from 'react';
import { notify } from '../../../components/toast-store';
import { dayBoundsOf } from '../../../format/time';
import { useInstantClock } from '../../../store/clock-format';
import {
  usePlannerItems,
  usePlannerTools,
  usePlannerWrites,
  type PlannerTools,
  type PlannerWrites,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { TodayActionsContext } from './today-actions-context';

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

class OutsideTodayActions extends Error {
  constructor() {
    super('This part of Today only works inside the Today actions provider.');
  }
}

export function useTodayActions(): TodayActionsValue {
  const value = useContext(TodayActionsContext);
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

class UnknownOccurrenceItem extends Error {
  constructor(itemId: string) {
    super(`The planner item ${itemId} is not loaded, so it cannot be reopened.`);
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
): Promise<string> {
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
  return slot.from;
}

function useHiddenKeys(): readonly [ReadonlySet<string>, Hide] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hide = (key: string, gone: boolean): void => {
    setHidden(
      (current) =>
        new Set(gone ? [...current, key] : [...current].filter((entry) => entry !== key)),
    );
  };
  return [hidden, hide];
}

type Hide = (key: string, hidden: boolean) => void;

function runOf(hide: Hide) {
  return <T,>(
    key: string,
    failure: string,
    work: () => Promise<T>,
    done: (result: T) => void,
  ): void => {
    hide(key, true);
    background(
      work().then(done, (error: unknown) => {
        hide(key, false);
        notify({ message: failure, error, tone: 'critical' });
      }),
      'planner.today_action_failed',
    );
  };
}

function undoOf(
  hide: Hide,
  items: readonly PlannerItemRow[],
  writes: PlannerWrites,
): (key: string, occurrence: PlannerOccurrenceView) => () => void {
  return (key, occurrence) => (): void => {
    const item = items.find((row) => row.id === occurrence.item_id);
    background(
      (item === undefined
        ? Promise.reject(new UnknownOccurrenceItem(occurrence.item_id))
        : writes.reopenItem(item, occurrence.occurrence_key)
      ).then(
        () => {
          hide(key, false);
        },
        (error: unknown) => {
          notify({ message: 'Couldn’t undo that', error, tone: 'critical' });
        },
      ),
      'planner.today_undo_failed',
    );
  };
}

function useOccurrenceActions(day: PlannerDay, hide: Hide): OccurrenceActions {
  const { person } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  const tools = usePlannerTools(person);
  const items = usePlannerItems(person);
  const instant = useInstantClock();
  const run = runOf(hide);
  const undo = undoOf(hide, items, writes);
  return {
    done: (key, occurrence): void => {
      run(
        key,
        'Couldn’t mark that done',
        () =>
          writes.completeItem(occurrence.item_id, { occurrence_key: occurrence.occurrence_key }),
        () => {
          notify({ message: 'Marked done', detail: occurrence.title, undo: undo(key, occurrence) });
        },
      );
    },
    skip: (key, occurrence): void => {
      run(
        key,
        'Couldn’t skip that',
        () => writes.skipItem(occurrence.item_id, occurrence.occurrence_key),
        () => {
          notify({ message: 'Skipped', detail: occurrence.title, undo: undo(key, occurrence) });
        },
      );
    },
    later: (key, occurrence): void => {
      const item = items.find((row) => row.id === occurrence.item_id);
      run(
        key,
        'Couldn’t move that to later',
        () => moveLater({ occurrence, item, day }, tools, writes),
        (start) => {
          notify({
            message: `Moved to ${instant(start, day.time_zone)}`,
            detail: occurrence.title,
          });
        },
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
