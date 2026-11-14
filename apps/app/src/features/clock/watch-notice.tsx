import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlannerAlarmRow } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { Badge } from '../../components/badge';
import { Card } from '../../components/card';
import { Icon } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import { Text } from '../../components/text';
import { ValueStore, useValue } from '../../design/external-store';
import { jsonText } from '../../format/json-text';
import { usePlannerAlarms } from '../planner/data';

const log = new Logger('app.clock');

const STORAGE_KEY = 'smarteverything.clock.watch-arrivals-seen';

const SEEN = z.record(z.string(), z.iso.datetime({ offset: true }));

export type ArrivalsSeen = z.infer<typeof SEEN>;

type Arrival = Pick<PlannerAlarmRow, 'id' | 'profile_id' | 'source' | 'created_at' | 'time'>;

export function watchArrivalsOf<A extends Arrival>(
  alarms: readonly A[],
  seen: ArrivalsSeen,
): readonly A[] {
  return alarms.filter((alarm) => {
    if (alarm.source !== 'watch') return false;
    const seenAt = seen[alarm.profile_id];
    return seenAt === undefined || Date.parse(alarm.created_at) > Date.parse(seenAt);
  });
}

export function seenThrough(seen: ArrivalsSeen, arrivals: readonly Arrival[]): ArrivalsSeen {
  const next: Record<string, string> = { ...seen };
  for (const alarm of arrivals) {
    const before = next[alarm.profile_id];
    if (before === undefined || Date.parse(alarm.created_at) > Date.parse(before)) {
      next[alarm.profile_id] = alarm.created_at;
    }
  }
  return next;
}

export function arrivalsText(count: number): string {
  return count === 1
    ? '1 alarm came in from your watch'
    : `${String(count)} alarms came in from your watch`;
}

const seenStore = new ValueStore<ArrivalsSeen | null>(null);

async function readSeen(): Promise<ArrivalsSeen> {
  const text = await AsyncStorage.getItem(STORAGE_KEY);
  if (text === null) return {};
  const read = jsonText(text);
  const parsed = read.ok ? SEEN.safeParse(read.value) : null;
  if (parsed?.success === true) return parsed.data;
  log.warn('watch_arrivals.seen_unreadable', { length: text.length });
  return {};
}

let loading: Promise<void> | null = null;

function loadSeen(): Promise<void> {
  loading ??= readSeen().then((seen) => {
    seenStore.set({ ...seen, ...seenStore.get() });
  });
  return loading;
}

function dismiss(arrivals: readonly Arrival[]): void {
  const next = seenThrough(seenStore.get() ?? {}, arrivals);
  seenStore.set(next);
  background(AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)), 'watch_arrivals.save_failed');
}

function ArrivalTimes({ arrivals }: { readonly arrivals: readonly Arrival[] }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {arrivals.map((alarm) => (
        <Badge key={alarm.id} label={alarm.time} icon="alarmClock" tone="primary" />
      ))}
    </View>
  );
}

export function WatchArrivalsNotice(): ReactNode {
  useEffect(() => {
    background(loadSeen(), 'watch_arrivals.load_failed');
  }, []);
  const seen = useValue(seenStore);
  const alarms = usePlannerAlarms(null);
  if (seen === null) return null;
  const arrivals = watchArrivalsOf(alarms, seen);
  if (arrivals.length === 0) return null;
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-md bg-primary-container">
          <Icon name="watch" size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">Watch alarms are here</Text>
          <Text variant="callout" tone="variant">
            {arrivalsText(arrivals.length)}
          </Text>
        </View>
        <IconButton
          icon="close"
          label="Dismiss"
          onPress={() => {
            dismiss(arrivals);
          }}
        />
      </View>
      <ArrivalTimes arrivals={arrivals} />
    </Card>
  );
}
