import type { PlannerRange } from '@smarteverything/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { IconButton } from '../../../components/icon-button';
import { useAnchoredMenu } from '../../../components/menu';
import type { HeaderAction } from '../../../components/page-header';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { keyPressOf } from '../../../design/keyboard';
import { isNative } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { joinParts } from '../../../format/text';
import { dayKeyOf, zonedStartOfDay } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useMinuteOf } from '../../../store/clock';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { rangeQuery } from '../data';
import { usePlannerCalendars } from '../data/sharing';
import { usePlannerFrame } from '../frame/frame-context';
import { usePlannerShownPerson } from '../frame/person';
import { PlannerFrame } from '../frame/planner-frame';
import { QueryBody } from '../frame/query-body';
import { frameLayoutOf } from '../frame/sections';
import { Composer } from '../item';
import { VIEW_OPTIONS } from '../settings/options';
import { useOwnPrefs, type Prefs } from '../settings/preferences';
import { AgendaList } from './agenda-list';
import { bookedLineOf, eventTextOf } from './booked-model';
import { PREVIOUS, TimeContent } from './calendar-stats';
import { CalendarsSheet } from './calendars-sheet';
import { shownCalendarsOf } from './calendars-model';
import type { MinuteSpan } from './grid-gestures';
import { MonthGrid } from './month-grid';
import {
  isTimeView,
  keyActionOf,
  steppedDay,
  titleOf,
  viewsFor,
  windowDaysOf,
  type CalendarView,
  type KeyAction,
} from './calendar-view-model';
import { openingViewOf } from './opening-view';
import { addDays } from './month-model';
import { PeopleTimeline } from './people-timeline';
import { YearHeat } from './year-heat';

function useCalendarKeys(
  views: readonly CalendarView[],
  onAction: (action: KeyAction) => void,
): void {
  const active = useIsFocused();
  const handle = useEffectEvent((event: KeyboardEvent): void => {
    const press = keyPressOf(event);
    if (press.typing || press.command || press.alt) return;
    const action = keyActionOf(press.key, views);
    if (action === null) return;
    event.preventDefault();
    onAction(action);
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      handle(event);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active]);
}

interface CalendarState {
  readonly view: CalendarView;
  readonly day: string;
  readonly views: readonly CalendarView[];
  readonly setView: (view: CalendarView) => void;
  readonly setDay: (day: string) => void;
  readonly previous: () => void;
  readonly next: () => void;
  readonly toToday: () => void;
}

function useCalendarState(prefs: Prefs, compact: boolean): CalendarState {
  const views = viewsFor(useIsOwner());
  const today = useMinuteOf(dayKeyOf);
  const [chosen, setView] = useState<CalendarView | null>(null);
  const [picked, setDay] = useState<string | null>(null);
  const view = chosen ?? openingViewOf(prefs.calendar.default_view, views, compact);
  const day = picked ?? today;
  const step = (by: number): void => {
    setDay(steppedDay(view, day, by));
  };
  useCalendarKeys(views, (action) => {
    if (action.kind === 'view') setView(action.view);
    else if (action.kind === 'step') step(action.by);
    else setDay(today);
  });
  return {
    view,
    day,
    views,
    setView,
    setDay,
    previous: (): void => {
      step(-1);
    },
    next: (): void => {
      step(1);
    },
    toToday: (): void => {
      setDay(today);
    },
  };
}

function viewLabelOf(view: CalendarView): string {
  return VIEW_OPTIONS.find((option) => option.value === view)?.label ?? view;
}

function ViewMenu({ state }: { readonly state: CalendarState }): ReactNode {
  const items = state.views.map((view) => ({
    label: viewLabelOf(view),
    icon: view === state.view ? ('check' as const) : ('calendar' as const),
    onPress: (): void => {
      state.setView(view);
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Calendar view');
  return (
    <View ref={ref} collapsable={false}>
      <FilterChip
        label="Calendar view"
        value={viewLabelOf(state.view)}
        active={false}
        affordance="menu"
        onPress={open}
      />
      {menu}
    </View>
  );
}

function Toolbar({
  state,
  compact,
}: {
  readonly state: CalendarState;
  readonly compact: boolean;
}): ReactNode {
  if (!compact) {
    return (
      <Segmented
        label="Calendar view"
        options={state.views.map((view) => ({ value: view, label: viewLabelOf(view) }))}
        value={state.view}
        onChange={state.setView}
      />
    );
  }
  return (
    <View className="flex-row items-center justify-between gap-2 pt-1">
      <ViewMenu state={state} />
      <View className="flex-row items-center gap-1">
        <IconButton icon="chevronLeft" label="Previous" onPress={state.previous} />
        <Button label="Today" variant="outlined" onPress={state.toToday} />
        <IconButton icon="chevronRight" label="Next" onPress={state.next} />
      </View>
    </View>
  );
}

interface Openers {
  readonly openSheet: () => void;
  readonly compose: (text: string) => void;
}

function actionsOf(
  compact: boolean,
  state: CalendarState,
  openers: Openers,
): readonly HeaderAction[] {
  const calendars: HeaderAction = { icon: 'eye', label: 'Calendars', onPress: openers.openSheet };
  if (compact) return [calendars];
  return [
    { icon: 'chevronLeft', label: 'Previous', iconOnly: true, onPress: state.previous },
    { icon: 'calendar', label: 'Today', onPress: state.toToday },
    { icon: 'chevronRight', label: 'Next', iconOnly: true, onPress: state.next },
    calendars,
    {
      icon: 'plus',
      label: 'New event',
      primary: true,
      onPress: (): void => {
        openers.compose('');
      },
    },
  ];
}

interface BodyProps {
  readonly state: CalendarState;
  readonly prefs: Prefs;
  readonly calendars: readonly string[] | null;
  readonly range: UseQueryResult<PlannerRange>;
  readonly days: readonly string[];
  readonly onCompose: (day: string, gap: MinuteSpan) => void;
}

function ViewBody({ state, prefs, calendars, range, days, onCompose }: BodyProps): ReactNode {
  const { view, day } = state;
  const openAs =
    (next: CalendarView) =>
    (opened: string): void => {
      state.setDay(opened);
      state.setView(next);
    };
  if (isTimeView(view)) {
    return (
      <QueryBody query={range}>
        {(data) => (
          <TimeContent
            input={{ days, range: data, prefs, calendars, onCompose }}
            previous={PREVIOUS[view]}
            side={view === 'day'}
          />
        )}
      </QueryBody>
    );
  }
  if (view === 'month')
    return <MonthGrid day={day} calendars={calendars} onOpenDay={openAs('day')} />;
  if (view === 'year')
    return <YearHeat day={day} calendars={calendars} onOpenMonth={openAs('month')} />;
  if (view === 'agenda') return <AgendaList day={day} calendars={calendars} />;
  return <PeopleTimeline day={day} calendars={calendars} prefs={prefs} onCreate={onCompose} />;
}

function useTimeRange(
  state: CalendarState,
  days: readonly string[],
  calendars: readonly string[] | null,
): UseQueryResult<PlannerRange> {
  const person = usePlannerShownPerson();
  const timeZone = useSettings().time_zone;
  const first = days[0] ?? state.day;
  const end = addDays(days[days.length - 1] ?? state.day, 1);
  const from = new Date(zonedStartOfDay(first, timeZone)).toISOString();
  const to = new Date(zonedStartOfDay(end, timeZone)).toISOString();
  return useScreenQuery({
    ...rangeQuery(person, from, to, calendars),
    enabled: isTimeView(state.view),
  });
}

function CalendarComposer({
  text,
  onClose,
}: {
  readonly text: string | null;
  readonly onClose: () => void;
}): ReactNode {
  const frame = usePlannerFrame();
  return (
    <Composer
      open={text !== null}
      onClose={onClose}
      target="planner"
      person={frame.person}
      text={text ?? ''}
      kind="event"
      disabled={frame.offline}
    />
  );
}

interface CalendarData {
  readonly calendars: readonly string[] | null;
  readonly days: readonly string[];
  readonly range: UseQueryResult<PlannerRange>;
  readonly subtitle: string;
  readonly time: boolean;
}

function useCalendarData(state: CalendarState, prefs: Prefs): CalendarData {
  const timeZone = useSettings().time_zone;
  const collections = usePlannerCalendars(usePlannerShownPerson());
  const calendars = shownCalendarsOf(collections);
  const weekStart = prefs.general.week_start;
  const time = isTimeView(state.view);
  const days = time ? windowDaysOf(state.view, state.day, weekStart) : [state.day];
  const range = useTimeRange(state, days, calendars);
  const booked = time ? bookedLineOf(range.data, { collections, days, timeZone }) : null;
  const subtitle = joinParts([titleOf(state.view, state.day, weekStart), booked]);
  return { calendars, days, range, subtitle, time };
}

function CalendarFrame({ prefs }: { readonly prefs: Prefs }): ReactNode {
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const state = useCalendarState(prefs, compact);
  const [sheet, setSheet] = useState(false);
  const [composer, setComposer] = useState<string | null>(null);
  const { calendars, days, range, subtitle, time } = useCalendarData(state, prefs);
  const openers = {
    openSheet: (): void => {
      setSheet(true);
    },
    compose: setComposer,
  };
  return (
    <PlannerFrame
      section="calendar"
      subtitle={subtitle}
      actions={actionsOf(compact, state, openers)}
      toolbar={<Toolbar state={state} compact={compact} />}
      scroll={!time && state.view !== 'agenda'}
    >
      <ViewBody
        state={state}
        prefs={prefs}
        calendars={calendars}
        range={range}
        days={days}
        onCompose={(day, gap) => {
          setComposer(eventTextOf(day, gap));
        }}
      />
      <CalendarsSheet
        open={sheet}
        onClose={() => {
          setSheet(false);
        }}
        prefs={prefs}
      />
      <CalendarComposer
        text={composer}
        onClose={() => {
          setComposer(null);
        }}
      />
    </PlannerFrame>
  );
}

export function CalendarPage(): ReactNode {
  const prefs = useOwnPrefs();
  if (prefs === undefined) {
    return (
      <PlannerFrame section="calendar">
        <View className="gap-3">
          <Skeleton shape="tile" />
          <Skeleton shape="block" />
        </View>
      </PlannerFrame>
    );
  }
  return <CalendarFrame prefs={prefs} />;
}
