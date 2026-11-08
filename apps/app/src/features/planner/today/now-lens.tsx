import {
  SIGNAL_SOURCES,
  baseNameOf,
  describeTrigger,
  triggerLookup,
  type PlannerCompletion,
  type PlannerDay,
  type PlannerItemRow,
  type PlannerOccurrenceView,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc } from '../../../components/charts/arc';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useAreaWidth } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { clock, dayBoundsOf } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceFace } from '../../devices';
import {
  usePlannerCollections,
  usePlannerItems,
  usePlannerTools,
  usePlannerWrites,
  useVisibleMinute,
  type PlannerTools,
  type PlannerWrites,
} from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { frameLayoutOf } from '../frame/sections';
import { MarkChip } from './happened-chip';

type FaceName = ComponentProps<typeof DeviceFace>['face'];

const MINUTE_MS = 60_000;
const ANY_LENGTH_MINUTES = 1;
const RING = { size: 64, thickness: 5 } as const;
const FACES: readonly FaceName[] = ['chip', 'row', 'row-expanded', 'tile', 'card', 'panel'];

export interface OccurrenceActions {
  readonly done: (key: string, occurrence: PlannerOccurrenceView) => void;
  readonly skip: (key: string, occurrence: PlannerOccurrenceView) => void;
  readonly later: (key: string, occurrence: PlannerOccurrenceView) => void;
}

export interface LensTiming {
  readonly phase: 'now' | 'next';
  readonly minutes: number;
  readonly progress: number;
}

function momentOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

export function lensOf(day: PlannerDay, hidden: ReadonlySet<string>): PlannerOccurrenceView | null {
  const shown = [...day.current, ...day.upcoming].filter(
    (occurrence) => !hidden.has(lensKeyOf(occurrence)),
  );
  return shown[0] ?? null;
}

export function lensKeyOf(occurrence: PlannerOccurrenceView): string {
  return `lens:${occurrence.item_id}:${occurrence.occurrence_key}`;
}

function previousEndOf(day: PlannerDay, start: number): number {
  const ends = [...day.done, ...day.missed, ...day.current]
    .map((occurrence) => momentOf(occurrence.end) ?? momentOf(occurrence.completed_at))
    .filter((end): end is number => end !== null && end <= start);
  return Math.max(dayBoundsOf(day.date, day.time_zone).start, ...ends);
}

function fraction(done: number, whole: number): number {
  return whole <= 0 ? 1 : Math.min(1, Math.max(0, done / whole));
}

export function lensTimingOf(
  occurrence: PlannerOccurrenceView,
  day: PlannerDay,
  now: number,
): LensTiming | null {
  const start = momentOf(occurrence.start) ?? momentOf(occurrence.due_at);
  if (start === null) return null;
  const end = momentOf(occurrence.end);
  if (now < start) {
    const from = previousEndOf(day, start);
    return {
      phase: 'next',
      minutes: Math.ceil((start - now) / MINUTE_MS),
      progress: fraction(now - from, start - from),
    };
  }
  if (end === null) return { phase: 'now', minutes: 0, progress: 1 };
  return {
    phase: 'now',
    minutes: Math.max(0, Math.ceil((end - now) / MINUTE_MS)),
    progress: fraction(now - start, end - start),
  };
}

export function lensPillOf(timing: LensTiming | null): string {
  if (timing === null) return 'Up next';
  if (timing.phase === 'next') return `Up next · in ${plural(timing.minutes, 'min', 'min')}`;
  return timing.minutes === 0 ? 'Now' : `Now · ${plural(timing.minutes, 'min', 'min')} left`;
}

export function ruleSentenceOf(
  completion: PlannerCompletion,
  device: Device | null,
): string | null {
  if (completion.kind !== 'signal') return null;
  const devices =
    device === null ? [] : [{ ...device, name: baseNameOf(device), roomId: device.room_id }];
  const lookup = triggerLookup(SIGNAL_SOURCES, { devices, rooms: [], people: [], chats: [] });
  return `Done when ${describeTrigger(completion.matcher, lookup)}`;
}

function faceOf(face: string | null): FaceName {
  return FACES.find((name) => name === face) ?? 'row';
}

function lengthMinutesOf(
  occurrence: PlannerOccurrenceView,
  item: PlannerItemRow | undefined,
): number {
  const start = momentOf(occurrence.start);
  const end = momentOf(occurrence.end);
  if (start !== null && end !== null)
    return Math.max(ANY_LENGTH_MINUTES, (end - start) / MINUTE_MS);
  return item?.estimate_minutes ?? ANY_LENGTH_MINUTES;
}

class NoFreeTimeToday extends Error {
  constructor() {
    super('No free time is left today.');
  }
}

async function moveLater(
  input: {
    readonly occurrence: PlannerOccurrenceView;
    readonly item: PlannerItemRow | undefined;
    readonly day: PlannerDay;
  },
  tools: PlannerTools,
  writes: PlannerWrites,
): Promise<void> {
  const { occurrence, item, day } = input;
  const minutes = Math.ceil(lengthMinutesOf(occurrence, item));
  const from = new Date().toISOString();
  const to = new Date(dayBoundsOf(day.date, day.time_zone).end).toISOString();
  const [slot] = await tools.freeSlots({ from, to, minutes });
  if (slot === undefined) throw new NoFreeTimeToday();
  const sized = occurrence.end !== null || (item?.estimate_minutes ?? null) !== null;
  await writes.moveItem(occurrence.item_id, {
    occurrence_key: occurrence.occurrence_key,
    start: slot.from,
    end: sized ? new Date(Date.parse(slot.from) + minutes * MINUTE_MS).toISOString() : null,
  });
}

export function useOccurrenceActions(
  day: PlannerDay,
  hide: (key: string, hidden: boolean) => void,
): OccurrenceActions {
  const { person } = usePlannerFrame();
  const writes = usePlannerWrites(person);
  const tools = usePlannerTools(person);
  const items = usePlannerItems(person);
  const run = (key: string, failure: string, work: () => Promise<unknown>): void => {
    hide(key, true);
    background(
      work().catch((error: unknown) => {
        hide(key, false);
        notify({ message: failure, error, tone: 'critical' });
      }),
      'planner.today_action_failed',
    );
  };
  return {
    done: (key, occurrence): void => {
      run(key, 'Couldn’t mark that done', () =>
        writes.completeItem(occurrence.item_id, { occurrence_key: occurrence.occurrence_key }),
      );
    },
    skip: (key, occurrence): void => {
      run(key, 'Couldn’t skip that', () =>
        writes.skipItem(occurrence.item_id, occurrence.occurrence_key),
      );
    },
    later: (key, occurrence): void => {
      const item = items.find((row) => row.id === occurrence.item_id);
      run(key, 'Couldn’t move that to later', () =>
        moveLater({ occurrence, item, day }, tools, writes),
      );
    },
  };
}

function Countdown({ timing }: { readonly timing: LensTiming | null }): ReactNode {
  if (timing === null || timing.minutes === 0) return null;
  const spoken =
    timing.phase === 'next'
      ? `${plural(timing.minutes, 'minute')} until it starts`
      : `${plural(timing.minutes, 'minute')} left`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={spoken}
      className="size-16 items-center justify-center"
    >
      <Arc
        value={timing.progress}
        size={RING.size}
        thickness={RING.thickness}
        colour="primary"
        overlay
      />
      <Text variant="label" className="tabular-nums">
        {`${String(timing.minutes)}m`}
      </Text>
    </View>
  );
}

function RuleChip({ item }: { readonly item: PlannerItemRow | undefined }): ReactNode {
  const completion = item?.completion ?? null;
  const subject = completion?.kind === 'signal' ? (completion.matcher.subject ?? null) : null;
  const device = useRow('devices', subject);
  const sentence = completion === null ? null : ruleSentenceOf(completion, device);
  if (sentence === null) return null;
  return <MarkChip icon="zap" label={sentence} dashed />;
}

function Devices({ occurrence }: { readonly occurrence: PlannerOccurrenceView }): ReactNode {
  return occurrence.attachments.map((attachment) =>
    attachment.kind === 'device' ? (
      <View key={attachment.deviceId} className="overflow-hidden rounded-md bg-surface-2">
        <DeviceFace
          deviceId={attachment.deviceId}
          face={faceOf(attachment.face)}
          context="nested"
        />
      </View>
    ) : null,
  );
}

export function rangeOf(occurrence: PlannerOccurrenceView, timeZone: string): string | null {
  if (occurrence.start === null) return null;
  const start = clock(occurrence.start, timeZone);
  return occurrence.end === null ? start : `${start} to ${clock(occurrence.end, timeZone)}`;
}

function Heading({
  occurrence,
  day,
  timing,
}: {
  readonly occurrence: PlannerOccurrenceView;
  readonly day: PlannerDay;
  readonly timing: LensTiming | null;
}): ReactNode {
  const { person } = usePlannerFrame();
  const collection = usePlannerCollections(person).find(
    (row) => row.id === occurrence.collection_id,
  );
  const range = rangeOf(occurrence, day.time_zone);
  const subtitle = [collection?.name ?? null, occurrence.location]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <>
      <View className="flex-row items-center justify-between gap-2">
        <Badge
          label={lensPillOf(timing)}
          icon="clock"
          tone={timing?.phase === 'now' ? 'primary' : 'neutral'}
        />
        {range === null ? null : (
          <Text variant="caption" tone="variant" className="tabular-nums">
            {range}
          </Text>
        )}
      </View>
      <View className="flex-row items-center gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="title-2" numberOfLines={2}>
            {occurrence.title}
          </Text>
          {subtitle === '' ? null : (
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <Countdown timing={timing} />
      </View>
    </>
  );
}

interface LensProps {
  readonly day: PlannerDay;
  readonly occurrence: PlannerOccurrenceView;
  readonly actions: OccurrenceActions;
}

function Lens({ day, occurrence, actions }: LensProps): ReactNode {
  const { person, offline } = usePlannerFrame();
  const ref = useRef<View>(null);
  const minute = useVisibleMinute(ref);
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const item = usePlannerItems(person).find((row) => row.id === occurrence.item_id);
  const key = lensKeyOf(occurrence);
  return (
    <View ref={ref} onLayout={minute.onLayout}>
      <Card className="border border-primary/30">
        <Heading
          occurrence={occurrence}
          day={day}
          timing={lensTimingOf(occurrence, day, minute.value)}
        />
        <Devices occurrence={occurrence} />
        <View className={compact ? 'gap-3' : 'flex-row flex-wrap items-center gap-2'}>
          <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">
            <RuleChip item={item} />
          </View>
          <View className="flex-row gap-2">
            {(['done', 'skip'] as const).map((action) => (
              <Button
                key={action}
                label={action === 'done' ? 'Done' : 'Skip'}
                {...(action === 'done' ? { icon: 'check' as const } : {})}
                variant="outlined"
                grow={compact}
                disabled={offline}
                onPress={() => {
                  actions[action](key, occurrence);
                }}
              />
            ))}
          </View>
        </View>
      </Card>
    </View>
  );
}

export function useHiddenKeys(): readonly [
  ReadonlySet<string>,
  (key: string, hidden: boolean) => void,
] {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hide = (key: string, gone: boolean): void => {
    setHidden(
      (current) =>
        new Set(gone ? [...current, key] : [...current].filter((entry) => entry !== key)),
    );
  };
  return [hidden, hide];
}

export function NowLens({ day }: { readonly day: PlannerDay }): ReactNode {
  const [hidden, hide] = useHiddenKeys();
  const actions = useOccurrenceActions(day, hide);
  const occurrence = lensOf(day, hidden);
  if (occurrence === null) return null;
  return <Lens day={day} occurrence={occurrence} actions={actions} />;
}
