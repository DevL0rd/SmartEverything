import type {
  PlannerCompletion,
  PlannerDay,
  PlannerItemRow,
  PlannerOccurrenceView,
} from '@smarteverything/domain';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc } from '../../../components/charts/arc';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { dayBoundsOf } from '../../../format/time';
import { useInstantClock, type InstantClock } from '../../clock/format/clock-format';
import { DeviceFace } from '../../devices';
import { usePlannerCollections, usePlannerItems, useVisibleMinute } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { MANUAL, ruleTitleOf, useRuleDevice, type RuleDevice } from '../item/completion-rule-row';
import { MarkChip } from './happened-chip';
import { occurrenceKeyOf } from './river-model';
import { useTodayActions, type OccurrenceActions } from './today-actions';

type FaceName = ComponentProps<typeof DeviceFace>['face'];

const MINUTE_MS = 60_000;
const RING = { size: 64, thickness: 5 } as const;
const FACES: readonly FaceName[] = ['chip', 'row', 'row-expanded', 'tile', 'card', 'panel'];

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
    (occurrence) => !hidden.has(occurrenceKeyOf(occurrence)),
  );
  return shown[0] ?? null;
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

export function lensRuleOf(
  completion: PlannerCompletion,
  device: RuleDevice | null,
): string | null {
  return completion.kind === 'signal' ? ruleTitleOf(completion, device) : null;
}

function faceOf(face: string | null): FaceName {
  return FACES.find((name) => name === face) ?? 'row';
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
  const completion = item?.completion ?? MANUAL;
  const sentence = lensRuleOf(completion, useRuleDevice(completion));
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

export function rangeOf(
  occurrence: PlannerOccurrenceView,
  timeZone: string,
  instant: InstantClock,
): string | null {
  if (occurrence.start === null) return null;
  const start = instant(occurrence.start, timeZone);
  return occurrence.end === null ? start : `${start} to ${instant(occurrence.end, timeZone)}`;
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
  const range = rangeOf(occurrence, day.time_zone, useInstantClock());
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
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const item = usePlannerItems(person).find((row) => row.id === occurrence.item_id);
  const key = occurrenceKeyOf(occurrence);
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
                variant={action === 'done' ? 'tonal' : 'outlined'}
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

export function NowLens({ day }: { readonly day: PlannerDay }): ReactNode {
  const { hidden, actions } = useTodayActions();
  const occurrence = lensOf(day, hidden);
  if (occurrence === null) return null;
  return <Lens day={day} occurrence={occurrence} actions={actions} />;
}
