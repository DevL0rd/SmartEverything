import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Memory, Trip } from '@smarteverything/domain';
import { ErrorState } from '../../../components/error-state';
import { Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { MemoryHero } from './hero';
import { WeekRow } from './memory-cards';
import type { MemoryBoard } from './model';
import { TripList } from './trip-cards';
import { YearReview } from './year-review';

export const TRIPS_CAPTION = 'Days away from home, by place';

export const WEEK_CAPTION = 'From your library, nothing leaves the hub';

export interface TripsState {
  readonly trips: readonly Trip[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly settled: boolean;
  readonly retry: () => void;
}

function Trips({
  state,
  compact,
  onPlay,
}: {
  readonly state: TripsState;
  readonly compact: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  if (state.error !== null) {
    return (
      <Section title="Trips">
        <ErrorState error={state.error} retry={state.retry} />
      </Section>
    );
  }
  if (state.loading) return <Skeleton shape="block" />;
  return state.trips.length === 0 ? null : (
    <Section title="Trips" caption={TRIPS_CAPTION}>
      <TripList trips={state.trips} compact={compact} onPlay={onPlay} />
    </Section>
  );
}

export function BoardSkeleton(): ReactNode {
  return (
    <View className="gap-4">
      <Skeleton shape="tile" />
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </View>
  );
}

export function MemoriesBoard({
  board,
  trips,
  compact,
  onPlay,
}: {
  readonly board: MemoryBoard;
  readonly trips: TripsState;
  readonly compact: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const year = board.year;
  return (
    <View className={compact ? 'gap-3' : 'gap-5'}>
      {board.hero.length === 0 ? null : (
        <MemoryHero memories={board.hero} compact={compact} onPlay={onPlay} />
      )}
      {board.week.length === 0 ? null : (
        <Section title="This week" caption={WEEK_CAPTION}>
          <WeekRow memories={board.week} compact={compact} onPlay={onPlay} />
        </Section>
      )}
      <Trips state={trips} compact={compact} onPlay={onPlay} />
      {year === null ? null : (
        <YearReview
          memory={year}
          compact={compact}
          onPlay={() => {
            onPlay(year);
          }}
        />
      )}
    </View>
  );
}
