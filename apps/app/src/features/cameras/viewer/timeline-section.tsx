import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CalendarDate } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { DateNav } from '../../../components/date-nav';
import { ErrorState } from '../../../components/error-state';
import { Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { FilterButton } from '../components/filter-sheet';
import { TimelineStrip } from '../components/timeline-strip';
import { useCameraDay, type CameraItem } from '../data/use-camera-day';
import { useRecordingLinks } from '../data/use-media-links';
import type { CameraEntry } from '../logic/cameras';
import { entryOf, recordingTarget } from '../logic/event-entries';
import { NO_FILTER, dayFraction, sameDay, type TimelineFilter } from '../logic/timeline';

function dateOf(day: CalendarDate): Date {
  return new Date(day.year, day.month - 1, day.day, 12);
}

function calendarOf(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

interface DayStripProps {
  readonly entry: CameraEntry;
  readonly items: readonly CameraItem[];
  readonly today: boolean;
}

function DayStrip({ entry, items, today }: DayStripProps): ReactNode {
  const router = useRouter();
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const thumbs = useRecordingLinks(
    items.flatMap((item) => (item.snapshot === null ? [] : [item.snapshot.id])),
    'thumb',
  );
  if (items.length === 0) {
    return (
      <Text variant="callout" tone="variant" className="px-1">
        Nothing happened on this day.
      </Text>
    );
  }
  return (
    <TimelineStrip
      label={`Events on the timeline for ${entry.name}`}
      now={today ? dayFraction(new Date(now).toISOString(), timeZone) : null}
      items={items.map((item) => ({
        id: item.id,
        kind: item.kind,
        details: item.event?.details ?? {},
        fraction: dayFraction(item.at, timeZone),
        time: clock(item.at, timeZone),
        thumb: item.snapshot === null ? null : (thumbs.data?.[item.snapshot.id]?.url ?? null),
      }))}
      onOpen={(id) => {
        const item = items.find((candidate) => candidate.id === id);
        const target = item === undefined ? null : recordingTarget(entryOf(item));
        router.navigate(target === null ? href.cameraEvents() : href.clip(entry.device.id, target));
      }}
    />
  );
}

export function TimelineSection({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const today = calendarOf(new Date(now));
  const [chosen, setChosen] = useState<CalendarDate | null>(null);
  const day = chosen ?? today;
  const [filter, setFilter] = useState<TimelineFilter>(NO_FILTER);
  const read = useCameraDay([entry.device.id], day, timeZone, filter);
  return (
    <Section title="Timeline">
      <View className="flex-row flex-wrap items-center justify-between gap-2 px-1">
        <DateNav
          value={dateOf(day)}
          range="day"
          max={dateOf(today)}
          onChange={(date) => {
            setChosen(calendarOf(date));
          }}
        />
        <FilterButton filter={filter} onChange={setFilter} cameras={[entry]} />
      </View>
      {read.status === 'loading' ? <Skeleton shape="block" className="h-28" /> : null}
      {read.status === 'failed' ? <ErrorState error={read.error} retry={read.retry} /> : null}
      {read.status === 'ready' ? (
        <DayStrip entry={entry} items={read.items} today={sameDay(day, today)} />
      ) : null}
    </Section>
  );
}
