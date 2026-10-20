import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { clock } from '../../../format/time';
import type { ListLinks } from './list-links';
import {
  groupTimeline,
  TIMELINE_HOURS,
  type TimelineEvent,
  type TimelineGroup,
} from './timeline-model';

const MOST_GROUPS = 4;

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
  return (
    <Interactive
      href={links.open(group.automationId)}
      label={`${group.name}, ${detail}`}
      className="min-h-8 gap-1"
    >
      <View className="flex-row items-baseline gap-2">
        <Text variant="caption" numberOfLines={1} className="min-w-0 shrink">
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
  const hidden = groups.length - MOST_GROUPS;
  return (
    <View className="gap-2 overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-1 px-3 py-2">
      <View className="flex-row items-baseline justify-between">
        <Text variant="label" tone="variant">
          {`Next ${String(TIMELINE_HOURS)} hours`}
        </Text>
        {events.length === 0 ? (
          <Text variant="caption" tone="faint">
            Nothing is scheduled
          </Text>
        ) : null}
      </View>
      {groups.slice(0, MOST_GROUPS).map((group) => (
        <GroupRow key={group.key} group={group} links={links} timeZone={timeZone} />
      ))}
      {hidden > 0 ? (
        <Text variant="caption" tone="faint">
          {`and ${String(hidden)} more`}
        </Text>
      ) : null}
    </View>
  );
}
