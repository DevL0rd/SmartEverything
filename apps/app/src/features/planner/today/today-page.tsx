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
import { usePlannerShownPerson } from '../frame/person';
import { QueryBody } from '../frame/query-body';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { CatchUpDeck } from './catch-up-deck';
import { DayRiver } from './day-river';
import { DayStripCard } from './day-strip';
import { DoneRibbon } from './done-ribbon';
import { InvitationsCard } from './invitations-card';
import { NowLens } from './now-lens';
import { TodaySideColumn } from './side-column';
import { TodayActions } from './today-actions';
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
        <InvitationsCard />
        <OpenDay />
        <GoogleAttention />
      </View>
    );
  }
  return (
    <TodayActions day={day}>
      <View className="min-w-0 flex-1 gap-4">
        <InvitationsCard />
        <CatchUpDeck day={day} />
        <NowLens day={day} />
        <DoneRibbon day={day} />
        <DayRiver day={day} savedAt={savedAt} />
        <GoogleAttention />
      </View>
    </TodayActions>
  );
}

function CompactDay({ day, savedAt }: DayProps): ReactNode {
  const move = useMoveProgress();
  const rings = useTodayRings(day, move);
  return (
    <View className="gap-4">
      {isOpenDay(day) ? null : (
        <DayStripCard day={day} compact>
          <TodayRingsLine rings={rings} moveTracked={move !== null} />
        </DayStripCard>
      )}
      <MainColumn day={day} savedAt={savedAt} />
      <TodaySideColumn day={day} move={move} layout="grid" withRings={false} />
    </View>
  );
}

function Day({ day, savedAt }: DayProps): ReactNode {
  const move = useMoveProgress();
  const layout = shellLayoutOf(useAreaWidth());
  if (layout === 'compact') return <CompactDay day={day} savedAt={savedAt} />;
  const wide = layout === 'wide';
  return (
    <View className="gap-4">
      {isOpenDay(day) ? null : <DayStripCard day={day} compact={false} />}
      <View className={wide ? 'flex-row items-start gap-4' : 'gap-4'}>
        <MainColumn day={day} savedAt={savedAt} />
        <TodaySideColumn day={day} move={move} layout={wide ? 'column' : 'grid'} withRings />
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
  const today = useMinuteOf(dayKeyOf);
  const failed = usePlannerDay(usePlannerShownPerson(), today).isError;
  return (
    <PlannerFrame section="index" summary={!failed}>
      <TodayBody />
    </PlannerFrame>
  );
}
