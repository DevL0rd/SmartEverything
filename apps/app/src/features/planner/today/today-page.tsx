import type { PlannerDay } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useAreaWidth } from '../../../design/size-class';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useMoveProgress } from '../../fitness';
import { usePlannerDay } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { PlannerFrame } from '../frame/planner-frame';
import { QueryBody } from '../frame/query-body';
import { frameLayoutOf } from '../frame/sections';
import { CatchUpDeck } from './catch-up-deck';
import { DayRiver } from './day-river';
import { DayStripCard } from './day-strip';
import { DoneRibbon } from './done-ribbon';
import { NowLens } from './now-lens';
import { TodaySideColumn } from './side-column';
import { TodayRingsLine, useTodayRings } from './today-rings';
import { GoogleAttention, OpenDay, TodaySkeleton, isOpenDay } from './today-states';

interface DayProps {
  readonly day: PlannerDay;
  readonly savedAt: number | null;
}

function MainColumn({ day, savedAt }: DayProps): ReactNode {
  if (isOpenDay(day)) {
    return (
      <View className="min-w-0 flex-1 gap-4">
        <OpenDay />
        <GoogleAttention />
      </View>
    );
  }
  return (
    <View className="min-w-0 flex-1 gap-4">
      <CatchUpDeck day={day} />
      <NowLens day={day} />
      <DoneRibbon day={day} />
      <DayRiver day={day} savedAt={savedAt} />
      <GoogleAttention />
    </View>
  );
}

function CompactDay({ day, savedAt }: DayProps): ReactNode {
  const rings = useTodayRings(day, useMoveProgress());
  return (
    <View className="gap-4">
      {isOpenDay(day) ? null : (
        <DayStripCard day={day} compact>
          <TodayRingsLine rings={rings} />
        </DayStripCard>
      )}
      <MainColumn day={day} savedAt={savedAt} />
    </View>
  );
}

function Day({ day, savedAt }: DayProps): ReactNode {
  const move = useMoveProgress();
  const layout = frameLayoutOf(useAreaWidth());
  if (layout === 'compact') return <CompactDay day={day} savedAt={savedAt} />;
  const wide = layout === 'wide';
  return (
    <View className="gap-4">
      <DayStripCard day={day} compact={false} />
      <View className={wide ? 'flex-row items-start gap-4' : 'gap-4'}>
        <MainColumn day={day} savedAt={savedAt} />
        <TodaySideColumn day={day} move={move} layout={wide ? 'column' : 'grid'} />
      </View>
    </View>
  );
}

function TodayBody(): ReactNode {
  const { person, offline } = usePlannerFrame();
  const today = useMinuteOf(dayKeyOf);
  const query = usePlannerDay(person, today);
  if (query.data === undefined && !query.isError) return <TodaySkeleton />;
  const savedAt = offline ? query.dataUpdatedAt : null;
  return <QueryBody query={query}>{(day) => <Day day={day} savedAt={savedAt} />}</QueryBody>;
}

export function TodayPage(): ReactNode {
  return (
    <PlannerFrame section="index" width="dashboard">
      <TodayBody />
    </PlannerFrame>
  );
}
