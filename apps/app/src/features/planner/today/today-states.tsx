import type { PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { plural } from '../../../format/text';
import { useGoogleAccount, usePlannerAlarms } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { useComposerControl } from '../frame/quick-add';
import { QuickAddComposer } from '../frame/quick-add-bar';

const TASK_STARTERS: readonly string[] = [
  'Brush teeth every day 07:30 and 22:00',
  'Walk 20 min on the treadmill',
];

const GOOGLE_SETTINGS = href.settings.page('connections/google');

export function isOpenDay(day: PlannerDay): boolean {
  return (
    day.missed.length === 0 &&
    day.current.length === 0 &&
    day.upcoming.length === 0 &&
    day.done.length === 0
  );
}

function WatchAlarmsRow(): ReactNode {
  const { person } = usePlannerFrame();
  const count = usePlannerAlarms(person).filter((alarm) => alarm.source === 'watch').length;
  if (count === 0) return null;
  return (
    <ListRow
      icon="watch"
      title="Watch alarms are here"
      subtitle={`${plural(count, 'alarm')} came in from your watch`}
      href={href.clock.alarms()}
      chevron
    />
  );
}

function StartRows(): ReactNode {
  const { offline, focusQuickAdd } = usePlannerFrame();
  return (
    <List title="Get started">
      <ListRow
        icon="plus"
        title="Add a task"
        subtitle="Try: brush teeth every day 07:30"
        onPress={focusQuickAdd}
        disabled={offline}
      />
      <ListRow
        icon="alarmClock"
        title="Set an alarm"
        subtitle="Opens Clock"
        href={href.clock.alarms()}
        chevron
      />
      <WatchAlarmsRow />
    </List>
  );
}

function StarterIdeas(): ReactNode {
  const { person, offline } = usePlannerFrame();
  const composer = useComposerControl();
  const start = (text: string) => (): void => {
    composer.open({ text, kind: 'task' });
  };
  return (
    <>
      <List title="Starter ideas" caption="Tap one to add it">
        {TASK_STARTERS.map((text) => (
          <ListRow key={text} icon="plus" title={text} onPress={start(text)} disabled={offline} />
        ))}
        <ListRow
          icon="alarmClock"
          title="Wake up 07:00 on weekdays"
          subtitle="Opens Clock"
          href={href.clock.alarms()}
          chevron
        />
      </List>
      <QuickAddComposer control={composer} target="planner" person={person} disabled={offline} />
    </>
  );
}

export function OpenDay(): ReactNode {
  return (
    <>
      <EmptyState
        icon="sun"
        title="Your day is open"
        body="Add a task or an event. Things you add from chat or Google show up here too."
      />
      <StartRows />
      <StarterIdeas />
    </>
  );
}

export function GoogleAttention(): ReactNode {
  const google = useGoogleAccount();
  if (!google.needsAttention) return null;
  return (
    <Banner
      tone="critical"
      title="Google needs attention"
      body="Google signed you out. Your planner items are safe."
      wrapBody
      action={{
        label: 'Relink Google',
        spoken: 'Relink Google, opens Settings › Accounts › Google',
        href: GOOGLE_SETTINGS,
        variant: 'tonal',
      }}
    />
  );
}

function RiverSkeleton(): ReactNode {
  return (
    <View className="flex-row items-start gap-3">
      <Skeleton shape="text" className="mt-1 w-10" />
      <Skeleton shape="circle" className="mt-1 size-2.5" />
      <View className="flex-1 gap-1.5">
        <Skeleton shape="text" className="w-3/5" />
        <Skeleton shape="text" className="h-2.5 w-2/5" />
      </View>
    </View>
  );
}

export function TodaySkeleton(): ReactNode {
  return (
    <View className="gap-4" aria-busy accessibilityLabel="Loading today">
      <Card>
        <Skeleton shape="line" className="h-5" />
        <View className="flex-row items-center gap-3">
          <Skeleton shape="circle" className="size-13" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-3/4" />
            <Skeleton shape="text" className="h-2.5 w-1/2" />
          </View>
        </View>
      </Card>
      <Card>
        <Skeleton shape="text" className="w-2/5" />
        <Skeleton shape="line" className="h-5 w-3/4" />
        <Skeleton shape="block" className="h-15" />
      </Card>
      <View className="gap-4">
        {['first', 'second', 'third', 'fourth'].map((key) => (
          <RiverSkeleton key={key} />
        ))}
      </View>
    </View>
  );
}
