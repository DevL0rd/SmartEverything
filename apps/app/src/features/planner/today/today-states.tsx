import type { PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { useGoogleAccount, usePlannerAlarms } from '../data';
import { usePlannerFrame } from '../frame/frame-context';

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
  return (
    <List title="Get started">
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
  const { offline, focusQuickAdd } = usePlannerFrame();
  const start = (text: string) => (): void => {
    focusQuickAdd({ text });
  };
  return (
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

function StripSkeleton({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <Card>
      {compact ? null : (
        <View className="flex-row items-center justify-between">
          <Skeleton shape="text" className="w-24" />
          <Skeleton shape="text" className="w-40" />
        </View>
      )}
      <View className="gap-2">
        <Skeleton shape="line" className={compact ? 'h-5' : 'h-6.5'} />
        <Skeleton shape="text" className="h-2.5 w-full" />
      </View>
      {compact ? (
        <>
          <View className="h-hairline bg-outline-variant" />
          <View className="flex-row items-center gap-3">
            <Skeleton shape="circle" className="size-14" />
            <View className="flex-1 gap-2">
              <Skeleton shape="text" className="w-3/4" />
              <Skeleton shape="text" className="h-2.5 w-1/2" />
            </View>
          </View>
        </>
      ) : null}
    </Card>
  );
}

function MainSkeleton(): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-4">
      <Card>
        <Skeleton shape="text" className="w-28" />
        <Skeleton shape="line" className="h-6 w-3/4" />
        <Skeleton shape="text" className="h-2.5 w-1/3" />
        <View className="flex-row justify-end gap-2">
          <Skeleton shape="block" className="h-10 w-24 rounded-full" />
          <Skeleton shape="block" className="h-10 w-20 rounded-full" />
        </View>
      </Card>
      <View className="gap-4">
        {['first', 'second', 'third', 'fourth'].map((key) => (
          <RiverSkeleton key={key} />
        ))}
      </View>
    </View>
  );
}

function SideSkeleton(): ReactNode {
  return (
    <View className="w-84 gap-4">
      <Card>
        <Skeleton shape="text" className="w-16" />
        <View className="flex-row items-center gap-4">
          <Skeleton shape="circle" className="size-28" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-full" />
            <Skeleton shape="text" className="w-full" />
            <Skeleton shape="text" className="w-full" />
          </View>
        </View>
        <Skeleton shape="block" className="h-16" />
      </Card>
    </View>
  );
}

export function TodaySkeleton(): ReactNode {
  const layout = shellLayoutOf(useAreaWidth());
  const compact = layout === 'compact';
  return (
    <View className="gap-4" aria-busy accessibilityLabel="Loading today">
      <StripSkeleton compact={compact} />
      <View className={layout === 'wide' ? 'flex-row items-start gap-4' : 'gap-4'}>
        <MainSkeleton />
        {layout === 'wide' ? <SideSkeleton /> : null}
      </View>
    </View>
  );
}
