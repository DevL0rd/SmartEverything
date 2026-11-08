import type {
  PlannerDay,
  PlannerHappened,
  PlannerOccurrenceView,
  PlannerRingRow,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { frameLayoutOf } from '../frame/sections';
import { HScroller } from '../../../components/h-scroller';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { compareText, plural } from '../../../format/text';
import { clock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { deviceIcon } from '../../device-visuals';
import { HappenedChip, MarkChip } from './happened-chip';

export type RibbonMark =
  | {
      readonly kind: 'done';
      readonly key: string;
      readonly at: number;
      readonly occurrence: PlannerOccurrenceView;
    }
  | {
      readonly kind: 'woke';
      readonly key: string;
      readonly at: number;
      readonly ring: PlannerRingRow;
    }
  | {
      readonly kind: 'happened';
      readonly key: string;
      readonly at: number;
      readonly happened: PlannerHappened;
    };

function doneAt(occurrence: PlannerOccurrenceView): number {
  const at = occurrence.completed_at ?? occurrence.start ?? occurrence.due_at;
  return at === null ? Number.POSITIVE_INFINITY : Date.parse(at);
}

export function byTime(
  left: { readonly at: number; readonly key: string },
  right: { readonly at: number; readonly key: string },
): number {
  if (left.at === right.at) return compareText(left.key, right.key);
  return left.at < right.at ? -1 : 1;
}

function woke(ring: PlannerRingRow): boolean {
  return ring.kind === 'alarm' && ring.outcome === 'rang' && ring.dismissed_at !== null;
}

export function ribbonMarksOf(day: PlannerDay): readonly RibbonMark[] {
  const marks: RibbonMark[] = [
    ...day.done.map((occurrence) => ({
      kind: 'done' as const,
      key: `done:${occurrence.item_id}:${occurrence.occurrence_key}`,
      at: doneAt(occurrence),
      occurrence,
    })),
    ...day.rings.filter(woke).map((ring) => ({
      kind: 'woke' as const,
      key: `woke:${ring.id}`,
      at: Date.parse(ring.due_at),
      ring,
    })),
    ...day.happened.map((happened, index) => ({
      kind: 'happened' as const,
      key: `happened:${happened.at}:${String(index)}`,
      at: Date.parse(happened.at),
      happened,
    })),
  ];
  return marks.sort(byTime);
}

export function ribbonLabelOf(marks: readonly RibbonMark[]): {
  readonly done: number;
  readonly happened: string | null;
} {
  const happened = marks.filter((mark) => mark.kind === 'happened').length;
  return {
    done: marks.length - happened,
    happened: happened === 0 ? null : `and ${plural(happened, 'thing')} that happened`,
  };
}

function wokeLabel(ring: PlannerRingRow): string {
  return ring.snoozes === 0 ? 'Up on the first ring' : `Up after ${plural(ring.snoozes, 'snooze')}`;
}

function DoneChip({
  occurrence,
  timeZone,
}: {
  readonly occurrence: PlannerOccurrenceView;
  readonly timeZone: string;
}): ReactNode {
  const device = useRow('devices', occurrence.evidence?.deviceId ?? null);
  const label = occurrence.evidence?.summary ?? occurrence.title;
  const time =
    occurrence.completed_at === null ? undefined : clock(occurrence.completed_at, timeZone);
  return (
    <MarkChip
      icon={device === null ? 'check' : deviceIcon(device)}
      iconTone="positive"
      label={label}
      {...(time === undefined ? {} : { time })}
      spoken={`${occurrence.title} done${time === undefined ? '' : ` at ${time}`}${label === occurrence.title ? '' : `, ${label}`}`}
      dashed={false}
    />
  );
}

function Mark({
  mark,
  timeZone,
}: {
  readonly mark: RibbonMark;
  readonly timeZone: string;
}): ReactNode {
  if (mark.kind === 'done') return <DoneChip occurrence={mark.occurrence} timeZone={timeZone} />;
  if (mark.kind === 'happened')
    return <HappenedChip happened={mark.happened} timeZone={timeZone} />;
  return (
    <MarkChip
      icon="alarmClock"
      iconTone="positive"
      time={clock(mark.ring.due_at, timeZone)}
      label={wokeLabel(mark.ring)}
      dashed={false}
    />
  );
}

function Marks({
  marks,
  timeZone,
}: {
  readonly marks: readonly RibbonMark[];
  readonly timeZone: string;
}): ReactNode {
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const chips = marks.map((mark) => <Mark key={mark.key} mark={mark} timeZone={timeZone} />);
  if (compact) {
    return (
      <HScroller label="Done today, scrolls sideways" fade fadeSurface="bg">
        {chips}
      </HScroller>
    );
  }
  return <View className="flex-row flex-wrap gap-2">{chips}</View>;
}

export function DoneRibbon({ day }: { readonly day: PlannerDay }): ReactNode {
  const marks = ribbonMarksOf(day);
  if (marks.length === 0) return null;
  const { done, happened } = ribbonLabelOf(marks);
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text variant="label">Done</Text>
        <Badge label={String(done)} tone="positive" />
        {happened === null ? null : (
          <Text variant="caption" tone="variant">
            {happened}
          </Text>
        )}
      </View>
      <Marks marks={marks} timeZone={day.time_zone} />
    </View>
  );
}
