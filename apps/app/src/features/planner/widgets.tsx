import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { z } from 'zod';
import { router } from 'expo-router';
import { href } from '../../app-shell/hrefs';
import type { BoardWidget, WidgetDefinition } from '../../components/widget-board';
import { allSizes } from '../../components/widget-board/all-sizes';
import { useHubOffline } from '../clock';
import { PlannerFrameContext } from './frame/frame-context';
import { PlannerAlarmWidget, PlannerTimerWidget } from './widgets/clock-cards';
import { PlannerDayWidget, PlannerItemWidget } from './widgets/planner-cards';

function openPlanner(): void {
  router.push(href.planner.index());
}

function Scope({ children }: { readonly children: ReactNode }): ReactNode {
  const offline = useHubOffline();
  return (
    <PlannerFrameContext value={{ person: null, offline, focusQuickAdd: openPlanner }}>
      <ScrollView className="flex-1" nestedScrollEnabled>
        {children}
      </ScrollView>
    </PlannerFrameContext>
  );
}

class MissingPlannerWidgetId extends Error {
  constructor(readonly type: string) {
    super(`The ${type} widget needs the id returned by a Planner read.`);
  }
}

const OPTIONS = z.strictObject({ id: z.uuid().optional(), day: z.iso.date().optional() });

function dayOf(options: BoardWidget['options']): { readonly day?: string } {
  const day = OPTIONS.parse(options ?? {}).day;
  return day === undefined ? {} : { day };
}

function idOf(options: BoardWidget['options'], type: string): string {
  const id = OPTIONS.parse(options ?? {}).id;
  if (id === undefined) throw new MissingPlannerWidgetId(type);
  return id;
}

const SIZE = { sizes: allSizes('W'), defaultSize: 'W' } as const;

export const PLANNER_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'planner-day',
    title: 'Planner day',
    icon: 'calendar',
    ...SIZE,
    render: ({ options }) => (
      <Scope>
        <PlannerDayWidget {...dayOf(options)} />
      </Scope>
    ),
  },
  {
    type: 'planner-item',
    title: 'Planner item',
    icon: 'circleCheck',
    ...SIZE,
    render: ({ options }) => (
      <Scope>
        <PlannerItemWidget id={idOf(options, 'item')} />
      </Scope>
    ),
  },
  {
    type: 'planner-alarm',
    title: 'Alarm',
    icon: 'alarmClock',
    ...SIZE,
    render: ({ options }) => (
      <Scope>
        <PlannerAlarmWidget id={idOf(options, 'alarm')} />
      </Scope>
    ),
  },
  {
    type: 'planner-timer',
    title: 'Timer',
    icon: 'timer',
    ...SIZE,
    render: ({ options }) => (
      <Scope>
        <PlannerTimerWidget id={idOf(options, 'timer')} />
      </Scope>
    ),
  },
];
