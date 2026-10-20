import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { percentString } from '../../../components/level-math';
import { Interactive } from '../../../components/interactive';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { DAY_MS, weekdayShort } from '../../../format/time';
import type { Device } from '../../../store/state';
import type { TargetHistory } from '../data/use-target-history';
import {
  cellOpacity,
  dayCells,
  laneOf,
  laneSummary,
  startsUnknown,
  type DayCell,
  type Lane,
  type LaneWindow,
  type Window,
} from '../model/lanes';
import type { MemberPower } from '../use-target-state';

const LANES_SHOWN = 12;
const WEEK_CELLS = 7;
const DAY_CAPTIONS = ['-24 h', '-18', '-12', '-6', 'now'] as const;

interface LaneRow {
  readonly member: Device;
  readonly lane: Lane;
  readonly power: MemberPower;
}

function useLanes(
  members: readonly Device[],
  history: TargetHistory,
  powers: Readonly<Record<string, MemberPower>>,
): readonly LaneRow[] {
  return useMemo(
    () =>
      members.map((member) => {
        const power = powers[member.id] ?? 'unknown';
        return {
          member,
          power,
          lane: laneOf(
            history.changes.get(member.id) ?? [],
            history.before.get(member.id),
            history.window,
          ),
        };
      }),
    [members, history.changes, history.before, history.window, powers],
  );
}

function Span({
  from,
  to,
  window,
  colour,
}: {
  readonly from: number;
  readonly to: number;
  readonly window: LaneWindow;
  readonly colour: string | undefined;
}): ReactNode {
  const total = window.to - window.from;
  const style = {
    left: percentString(((from - window.from) / total) * 100),
    width: percentString(Math.max(0.5, ((to - from) / total) * 100)),
    backgroundColor: colour,
  };
  return <View className="absolute inset-y-0 rounded-xs bg-primary" style={style} />;
}

function Spans({
  lane,
  window,
  colour,
}: {
  readonly lane: Lane;
  readonly window: LaneWindow;
  readonly colour: string | undefined;
}): ReactNode {
  const total = window.to - window.from;
  const unknown = { width: percentString(((lane.knownFrom - window.from) / total) * 100) };
  return (
    <View className="h-3 overflow-hidden rounded-xs border-hairline border-outline-variant bg-surface-2">
      {lane.spans.map((span) => (
        <Span key={span.start} from={span.start} to={span.end} window={window} colour={colour} />
      ))}
      {startsUnknown(lane, window) ? (
        <View
          className="absolute inset-y-0 left-0 border-r border-dashed border-outline bg-surface-3"
          style={unknown}
        />
      ) : null}
    </View>
  );
}

function Cell({
  cell,
  colour,
}: {
  readonly cell: DayCell;
  readonly colour: string | undefined;
}): ReactNode {
  const style = { opacity: cellOpacity(cell.ms), backgroundColor: colour };
  return (
    <View
      className={cn(
        'flex-1 overflow-hidden rounded-xs border-hairline',
        cell.known
          ? 'border-outline-variant bg-surface-2'
          : 'border-dashed border-outline bg-surface-3',
      )}
    >
      <View className="absolute inset-0 bg-primary" style={style} />
    </View>
  );
}

function Days({
  lane,
  window,
  colour,
}: {
  readonly lane: Lane;
  readonly window: LaneWindow;
  readonly colour: string | undefined;
}): ReactNode {
  return (
    <View className="h-6 flex-row gap-0.5" aria-hidden>
      {dayCells(lane, window, WEEK_CELLS).map((cell, index) => (
        <Cell key={String(index)} cell={cell} colour={colour} />
      ))}
    </View>
  );
}

function LaneItem({
  row,
  window,
  colour,
  span,
}: {
  readonly row: LaneRow;
  readonly window: LaneWindow;
  readonly colour: string | undefined;
  readonly span: Window;
}): ReactNode {
  const summary = laneSummary(row.lane, window, row.power === 'offline', span);
  return (
    <Interactive
      href={href.device(row.member)}
      label={`${row.member.label}, ${summary.spoken}`}
      className="gap-1 rounded-sm py-1.5"
      layerClassName="rounded-sm"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
          {row.member.label}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular shrink-0">
          {summary.text}
        </Text>
      </View>
      {span === 'day' ? (
        <Spans lane={row.lane} window={window} colour={colour} />
      ) : (
        <Days lane={row.lane} window={window} colour={colour} />
      )}
    </Interactive>
  );
}

function Axis({ span, window }: { readonly span: Window; readonly window: LaneWindow }): ReactNode {
  const captions =
    span === 'day'
      ? DAY_CAPTIONS
      : Array.from({ length: WEEK_CELLS }, (_, index) =>
          weekdayShort(window.from + index * DAY_MS + DAY_MS / 2),
        );
  return (
    <View className="flex-row justify-between pt-1" aria-hidden>
      {captions.map((caption, index) => (
        <Text
          key={`${caption}-${String(index)}`}
          variant="caption"
          tone="faint"
          className="tabular"
        >
          {caption}
        </Text>
      ))}
    </View>
  );
}

function Body({
  rows,
  history,
  colours,
  span,
}: {
  readonly rows: readonly LaneRow[];
  readonly history: TargetHistory;
  readonly colours: Readonly<Record<string, string>>;
  readonly span: Window;
}): ReactNode {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LANES_SHOWN);
  const partial = rows.some((row) => startsUnknown(row.lane, history.window));
  return (
    <>
      {shown.map((row) => (
        <LaneItem
          key={row.member.id}
          row={row}
          window={history.window}
          colour={colours[row.member.id]}
          span={span}
        />
      ))}
      <Axis span={span} window={history.window} />
      {rows.length > LANES_SHOWN ? (
        <Button
          label={all ? 'Show fewer lanes' : `Show all ${String(rows.length)} lanes`}
          variant="text"
          onPress={() => {
            setAll(!all);
          }}
        />
      ) : null}
      {partial ? (
        <Text variant="footnote" tone="variant">
          Dashed time is from before this hub saw the light change.
        </Text>
      ) : null}
    </>
  );
}

function Content({
  rows,
  history,
  colours,
  span,
}: {
  readonly rows: readonly LaneRow[];
  readonly history: TargetHistory;
  readonly colours: Readonly<Record<string, string>>;
  readonly span: Window;
}): ReactNode {
  if (history.status === 'loading')
    return (
      <View className="gap-3 py-2">
        <Skeleton shape="block" className="h-10" />
        <Skeleton shape="block" className="h-10" />
      </View>
    );
  if (history.status === 'error')
    return (
      <View className="flex-row items-center justify-between gap-3 py-2">
        <Text variant="footnote" tone="variant">
          The history could not load.
        </Text>
        <Button label="Retry" variant="text" onPress={history.refetch} />
      </View>
    );
  return <Body rows={rows} history={history} colours={colours} span={span} />;
}

export function TodayLanes({
  members,
  history,
  colours,
  powers,
  span,
  onSpan,
  noun,
}: {
  readonly members: readonly Device[];
  readonly history: TargetHistory;
  readonly colours: Readonly<Record<string, string>>;
  readonly powers: Readonly<Record<string, MemberPower>>;
  readonly span: Window;
  readonly onSpan: (span: Window) => void;
  readonly noun: string;
}): ReactNode {
  const rows = useLanes(members, history, powers);
  return (
    <View
      role="group"
      aria-label={`On time ${span === 'day' ? 'today' : 'this week'} for ${plural(rows.length, noun)}`}
      className="rounded-lg border-hairline border-outline-variant bg-surface-1 px-4 pb-3 pt-2"
    >
      <View className="items-end pb-2">
        <Segmented
          label="Window"
          value={span}
          onChange={onSpan}
          options={[
            { value: 'day', label: '24 h' },
            { value: 'week', label: '7 d' },
          ]}
        />
      </View>
      <Content rows={rows} history={history} colours={colours} span={span} />
    </View>
  );
}
