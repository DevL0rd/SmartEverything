import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { Idiom } from '../../../design/tokens';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { WidgetFrameBox } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import { DeviceFace, deviceModelOf } from '../../devices';
import {
  planRows,
  rowMetrics,
  spanParts,
  type RowMetrics,
  type RowPart,
  type RowPlan,
} from '../group-layout';
import { colourNote, listLabel, memberNoun } from '../group-summary';
import { GroupGlyph, GroupTitle } from './group-header';
import { LevelBand, WhiteBand } from './master-band';
import { ShowAll } from './member-parts';
import { noticeCount, Notices } from './notices';
import type { GroupControls } from './use-group-controls';
import type { GroupData } from './use-group-data';

const OFFLINE_EXTRA = 70;
const COLOUR_EXTRA = 128;
const WHITE_EXTRA = 90;

function expansionExtra(device: Device | undefined): number {
  if (device === undefined) return 0;
  if (!device.online) return OFFLINE_EXTRA;
  const colour = deviceModelOf(device).presentation.capabilities.some(
    (presented) => presented.role === 'color',
  );
  return colour ? COLOUR_EXTRA : WHITE_EXTRA;
}

function columnsOf<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  return Array.from({ length: columns }, (_, column) =>
    items.filter((_item, index) => index % columns === column),
  );
}

function planFor(
  data: GroupData,
  frame: WidgetFrameBox,
  wide: boolean,
  expanded: string | null,
): RowPlan {
  const index = data.members.findIndex((member) => member.id === expanded);
  return planRows({
    width: frame.width,
    height: frame.height,
    idiom: frame.idiom,
    total: data.members.length,
    wide,
    expandedIndex: index < 0 ? null : index,
    expandedExtra: expansionExtra(data.members[index]),
    lines: noticeCount(data),
    note: data.lights && colourNote(data.view.state, memberNoun(data.lights)) !== null,
  });
}

function Header({
  data,
  controls,
  titleHref,
}: {
  readonly data: GroupData;
  readonly controls: GroupControls;
  readonly titleHref: Href | undefined;
}): ReactNode {
  const title = <GroupTitle name={data.name} state={data.view.state} />;
  return (
    <View className="flex-row items-center gap-2">
      <GroupGlyph on={data.view.state.on > 0} lights={data.lights} />
      {titleHref === undefined ? (
        title
      ) : (
        <Interactive
          href={titleHref}
          label={`${data.name}, see all`}
          className="min-w-0 flex-1 rounded-xs"
          layerClassName="rounded-xs"
        >
          <View className="flex-row items-center gap-1">
            {title}
            <Icon name="chevronRight" size={16} tone="faint" />
          </View>
        </Interactive>
      )}
      {controls.colour}
      {controls.power}
    </View>
  );
}

function MemberColumns({
  part,
  expanded,
  setExpanded,
  metrics,
}: {
  readonly part: RowPart<Device>;
  readonly expanded: string | null;
  readonly setExpanded: (id: string | null) => void;
  readonly metrics: RowMetrics;
}): ReactNode {
  const rowStyle = { columnGap: metrics.column };
  const columnStyle = { gap: metrics.gap };
  return (
    <View className="flex-row" style={rowStyle}>
      {columnsOf(part.items, part.columns).map((column) => (
        <View key={column[0]?.id ?? 'empty'} className="min-w-0 flex-1" style={columnStyle}>
          {column.map((member) => (
            <DeviceFace
              key={member.id}
              deviceId={member.id}
              face={expanded === member.id ? 'row-expanded' : 'row'}
              context="nested"
              onToggleExpand={() => {
                setExpanded(expanded === member.id ? null : member.id);
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function Rows({
  data,
  plan,
  expanded,
  setExpanded,
  idiom,
  span,
}: {
  readonly data: GroupData;
  readonly plan: RowPlan;
  readonly expanded: string | null;
  readonly setExpanded: (id: string | null) => void;
  readonly idiom: Idiom;
  readonly span: boolean;
}): ReactNode {
  const metrics = rowMetrics(idiom);
  const stack = { gap: metrics.gap };
  const visible = data.members.slice(plan.start, plan.start + plan.count);
  return (
    <View role="group" aria-label={listLabel(memberNoun(data.lights), data.name)} style={stack}>
      {spanParts(visible, plan.columns, span ? expanded : null).map((part) => (
        <MemberColumns
          key={part.items[0]?.id ?? 'empty'}
          part={part}
          expanded={expanded}
          setExpanded={setExpanded}
          metrics={metrics}
        />
      ))}
    </View>
  );
}

function Bands({ data }: { readonly data: GroupData }): ReactNode {
  const { state, colours } = data.view;
  const band = {
    state,
    colours,
    master: data.master,
    name: data.name,
    lights: data.lights,
    noun: memberNoun(data.lights),
  };
  return (
    <>
      <LevelBand {...band} />
      <WhiteBand {...band} />
    </>
  );
}

function Footer({
  data,
  hidden,
  note,
}: {
  readonly data: GroupData;
  readonly hidden: number;
  readonly note: string | null;
}): ReactNode {
  if (hidden === 0 && note === null) return null;
  return (
    <View className="flex-row items-center justify-between">
      {note === null ? (
        <View />
      ) : (
        <Text variant="footnote" tone="variant">
          {note}
        </Text>
      )}
      {hidden > 0 ? (
        <ShowAll
          label={`+${String(hidden)} more · Show all`}
          hint={`Show all ${memberNoun(data.lights)}s in ${data.name}`}
          href={data.href}
        />
      ) : null}
    </View>
  );
}

export function TallFace({
  data,
  controls,
  frame,
  wide,
  allColumns,
  titleHref,
}: {
  readonly data: GroupData;
  readonly controls: GroupControls;
  readonly frame: WidgetFrameBox;
  readonly wide: boolean;
  readonly allColumns: number | null;
  readonly titleHref: Href | undefined;
}): ReactNode {
  const [expanded, setExpanded] = useState<string | null>(null);
  const plan =
    allColumns === null
      ? planFor(data, frame, wide, expanded)
      : { columns: allColumns, start: 0, count: data.members.length, hidden: 0 };
  const note = data.lights ? colourNote(data.view.state, memberNoun(data.lights)) : null;
  const stack = { gap: rowMetrics(frame.idiom).gap };
  return (
    <View className="flex-1" style={stack}>
      <Header data={data} controls={controls} titleHref={titleHref} />
      <Bands data={data} />
      <Notices data={data} />
      <Rows
        data={data}
        plan={plan}
        expanded={expanded}
        setExpanded={setExpanded}
        idiom={frame.idiom}
        span={allColumns !== null}
      />
      <Footer data={data} hidden={plan.hidden} note={note} />
    </View>
  );
}
