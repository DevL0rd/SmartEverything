import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { HOUR_MS, clock } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { IconWell } from '../../../components/icon-well';
import { CARD_FRAME } from './card-frame';
import type { ListLinks } from './list-links';
import {
  groupTimeline,
  TIMELINE_HOURS,
  type TimelineEvent,
  type TimelineGroup,
} from './timeline-model';

function cadence(minutes: number): string {
  return minutes % 60 === 0 ? `every ${String(minutes / 60)} h` : `every ${String(minutes)} min`;
}

export function groupDetail(group: TimelineGroup, timeZone: string | null): string {
  const first = group.events[0];
  const last = group.events[group.events.length - 1];
  if (first === undefined || last === undefined) {
    return '';
  }
  if (group.events.length === 1) {
    return `${group.kind === 'parked' ? 'resumes ' : ''}${clock(first.at, timeZone)}`;
  }
  const runs = `${String(group.events.length)} runs`;
  return group.everyMinutes === null
    ? `${clock(first.at, timeZone)} to ${clock(last.at, timeZone)} · ${runs}`
    : `${cadence(group.everyMinutes)} · ${runs}`;
}

function dotStyle(event: TimelineEvent, width: number): ViewStyle {
  return { left: Math.round(event.fraction * width) };
}

function Track({ group }: { readonly group: TimelineGroup }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View
      onLayout={onLayout}
      className="relative mr-2 h-2 border-b-hairline border-outline-variant"
    >
      {width === 0
        ? null
        : group.events.map((event) => (
            <View
              key={event.key}
              style={dotStyle(event, width)}
              className={cn(
                'absolute top-0 size-2 rounded-full',
                group.kind === 'parked' ? 'bg-warning' : 'bg-primary',
              )}
            />
          ))}
    </View>
  );
}

function GroupRow({
  group,
  links,
  timeZone,
}: {
  readonly group: TimelineGroup;
  readonly links: ListLinks;
  readonly timeZone: string | null;
}): ReactNode {
  const detail = groupDetail(group, timeZone);
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      href={links.open(group.automationId)}
      label={`${group.name}, ${detail}`}
      className={cn('justify-center gap-1', pointer ? 'min-h-9' : 'min-h-touch-min')}
    >
      <View className="flex-row items-baseline gap-2">
        <Text variant="callout" className="min-w-0 flex-1">
          {group.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="ml-auto shrink-0">
          {detail}
        </Text>
      </View>
      <Track group={group} />
    </Interactive>
  );
}

const AXIS_STEPS = [0, 3, 6, 9, 12] as const;
const AXIS_LABEL_WIDTH = 48;

function axisStyle(hours: number, width: number): ViewStyle {
  if (hours === 0) return { left: 0 };
  if (hours === TIMELINE_HOURS) return { right: 0 };
  return {
    left: (hours / TIMELINE_HOURS) * width - AXIS_LABEL_WIDTH / 2,
    width: AXIS_LABEL_WIDTH,
  };
}

function Axis({ timeZone }: { readonly timeZone: string | null }): ReactNode {
  const now = useMinute();
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View onLayout={onLayout} className="relative mr-2 h-5">
      {width === 0
        ? null
        : AXIS_STEPS.map((hours) => (
            <View key={hours} style={axisStyle(hours, width)} className="absolute top-0">
              <Text variant="caption" tone="faint" align="center" className="tabular">
                {hours === 0 ? 'Now' : clock(now + hours * HOUR_MS, timeZone)}
              </Text>
            </View>
          ))}
    </View>
  );
}

export function TimelineBand({
  events,
  links,
  timeZone,
}: {
  readonly events: readonly TimelineEvent[];
  readonly links: ListLinks;
  readonly timeZone: string | null;
}): ReactNode {
  const groups = groupTimeline(events);
  return (
    <View className={CARD_FRAME}>
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="title-3">Coming up</Text>
        <Text variant="caption" tone="variant">
          {`Next ${String(TIMELINE_HOURS)} hours`}
        </Text>
      </View>
      {groups.length === 0 ? (
        <View className="flex-row items-center gap-3">
          <IconWell icon="calendar" colour="primary" size="s" />
          <Text variant="callout" tone="variant" className="min-w-0 flex-1">
            {`Nothing is scheduled in the next ${String(TIMELINE_HOURS)} hours`}
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          <Axis timeZone={timeZone} />
          {groups.map((group) => (
            <GroupRow key={group.key} group={group} links={links} timeZone={timeZone} />
          ))}
        </View>
      )}
    </View>
  );
}
