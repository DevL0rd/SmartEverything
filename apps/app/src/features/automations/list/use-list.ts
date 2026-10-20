import { useMemo, useState } from 'react';
import type {
  AutomationRowV3,
  AutomationRunSummary,
  FunctionLookup,
  NodeKind,
  Place,
  RefNames,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { isIconName } from '../../../components/icon';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useAutomationsSource } from '../data/source';
import { useAutomations } from '../data/use-automations';
import { useRuns } from '../data/use-runs';
import { entriesOf, type ListContext, type ListEntry } from './list-entries';
import {
  DEFAULT_VIEW,
  countOf,
  filterChoices,
  sectionsOf,
  type FilterChoice,
  type Section,
  type View,
} from './list-view';
import { healthOf, statsByAutomation, type Health } from './run-stats';
import { nextUp, timelineOf, type TimelineEvent } from './timeline-model';

export interface ListEnvironment {
  readonly names: RefNames;
  readonly functions: FunctionLookup;
  readonly rooms: ReadonlyMap<string, string>;
  readonly updates: ReadonlySet<string>;
  readonly place: Place;
}

export interface AutomationsList {
  readonly entries: readonly ListEntry[];
  readonly sections: readonly Section[];
  readonly shown: number;
  readonly choices: readonly FilterChoice[];
  readonly health: Health;
  readonly events: readonly TimelineEvent[];
  readonly next: TimelineEvent | null;
  readonly rejected: number;
  readonly view: View;
  readonly setView: (view: View) => void;
  readonly iconOf: (entry: ListEntry) => IconName;
  readonly timeZone: string;
}

const NO_RUNS: readonly AutomationRunSummary[] = [];
const FALLBACK_ICON: IconName = 'automations';

function kindLookup(kinds: readonly NodeKind[]): ReadonlyMap<string, NodeKind> {
  return new Map(kinds.map((kind) => [kind.id, kind]));
}

function useEntries(
  rows: readonly AutomationRowV3[],
  runs: readonly AutomationRunSummary[],
  today: string,
  environment: ListEnvironment,
): readonly ListEntry[] {
  const { kinds } = useAutomationsSource();
  const { place, names, functions, rooms, updates } = environment;
  const byKind = useMemo(() => kindLookup(kinds), [kinds]);
  return useMemo(() => {
    const lookup = (id: string): NodeKind | undefined => byKind.get(id);
    const context: ListContext = {
      describe: { kinds: lookup, names },
      references: { kinds: lookup, functions },
      rooms,
      updates,
    };
    return entriesOf(rows, statsByAutomation(runs, today, place.timeZone), context);
  }, [rows, runs, today, place.timeZone, byKind, names, functions, rooms, updates]);
}

function useEvents(
  rows: readonly AutomationRowV3[],
  runs: readonly AutomationRunSummary[],
  now: number,
  place: Place,
): readonly TimelineEvent[] {
  return useMemo(() => {
    const rules = rows.map((row) => ({
      id: row.id,
      name: row.name,
      scheduled: { program: row.definition, enabled: row.enabled, lastRunAt: row.last_run_at },
    }));
    const names = new Map(rows.map((row) => [row.id, row.name]));
    return timelineOf({ rules, runs, names, now, place });
  }, [rows, runs, now, place]);
}

function useIconOf(): (entry: ListEntry) => IconName {
  const { kinds } = useAutomationsSource();
  const byKind = useMemo(() => kindLookup(kinds), [kinds]);
  return useMemo(
    () =>
      (entry: ListEntry): IconName => {
        const icon = entry.leadKind === null ? undefined : byKind.get(entry.leadKind)?.icon;
        return icon !== undefined && isIconName(icon) ? icon : FALLBACK_ICON;
      },
    [byKind],
  );
}

export function useAutomationsList(environment: ListEnvironment): AutomationsList {
  const { rows, rejected } = useAutomations();
  const runs = useRuns(null).data ?? NO_RUNS;
  const now = useMinute();
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const { place, rooms } = environment;
  const entries = useEntries(rows, runs, localDayKey(now, place.timeZone), environment);
  const sections = useMemo(() => sectionsOf(entries, view), [entries, view]);
  const choices = useMemo(() => filterChoices(entries, rooms), [entries, rooms]);
  const health = useMemo(() => healthOf(runs, now, place.timeZone), [runs, now, place.timeZone]);
  const events = useEvents(rows, runs, now, place);
  return {
    entries,
    sections,
    shown: countOf(sections),
    choices,
    health,
    events,
    next: nextUp(events),
    rejected,
    view,
    setView,
    iconOf: useIconOf(),
    timeZone: place.timeZone,
  };
}
