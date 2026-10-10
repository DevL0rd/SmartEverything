import type { ReactNode } from 'react';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import {
  chatWidgetsOf,
  isChatLink,
  type AssistantMessageRow,
  type ChatWidget,
} from '@smarteverything/domain';
import { SEMANTIC_SIZES, type SemanticSizes } from '../../../design/tokens';
import { useIdiom } from '../../../design/platform';
import { useAppliedTheme } from '../../../design/theme';
import type { WidgetSize } from '../../../components/widget-board';
import { LinkCards } from './link-card';
import { useLaneEntries, type LaneEntry } from './lane-entries';
import { placeSlots, type Metrics, type Placed, type Slot } from './lane-layout';
import { LiveCaption } from './live-caption';
import { UnavailableTile } from './unavailable-tile';
import { type BoardChatWidget, type ResolvedWidget } from './widget-sources';

const TILE_ROWS = 1.8;

function sizeOf(widget: ResolvedWidget, shared: boolean): WidgetSize {
  if (widget.compact) {
    return 'S';
  }
  const allowed = widget.definition.sizes.compact;
  const wanted: WidgetSize = shared ? 'M' : 'W';
  if (allowed.includes(wanted)) {
    return wanted;
  }
  return allowed.includes('M') ? 'M' : widget.definition.defaultSize;
}

function slotOf(entry: LaneEntry): Slot {
  if (entry.status === 'unavailable') {
    return { kind: 'note', aspect: null };
  }
  const { widget } = entry;
  const { aspect } = widget.definition;
  if (aspect !== undefined) {
    return { kind: 'wide', aspect };
  }
  if (widget.compact) {
    return { kind: 'tile', aspect: null };
  }
  return { kind: widget.wide ? 'wide' : 'half', aspect: null };
}

function metricsOf(sizes: SemanticSizes, fontScale: number): Metrics {
  const scale = Math.max(1, fontScale);
  return {
    gap: sizes.gridGap,
    unit: sizes.rowUnit * 2 + sizes.gridGap,
    line: sizes.rowUnit,
    tile: Math.round(sizes.rowUnit * TILE_ROWS * scale),
  };
}

function boxStyle(placed: Placed): {
  readonly width: number | undefined;
  readonly height: number | undefined;
} {
  return { width: placed.width ?? undefined, height: placed.height ?? undefined };
}

function OneWidget({
  widget,
  placed,
}: {
  readonly widget: ResolvedWidget;
  readonly placed: Placed;
}): ReactNode {
  const rendered = widget.definition.render({
    size: sizeOf(widget, placed.shared),
    options: widget.options,
    editing: false,
  });
  return (
    <View style={boxStyle(placed)} className="overflow-hidden rounded-lg">
      {widget.scope === null ? rendered : widget.scope(rendered)}
    </View>
  );
}

function LaneItem({
  entry,
  placed,
}: {
  readonly entry: LaneEntry;
  readonly placed: Placed;
}): ReactNode {
  return entry.status === 'ready' ? (
    <OneWidget widget={entry.widget} placed={placed} />
  ) : (
    <UnavailableTile entry={entry} />
  );
}

function WidgetLane({ widgets }: { readonly widgets: readonly BoardChatWidget[] }): ReactNode {
  const entries = useLaneEntries(widgets);
  const idiom = useIdiom();
  const { density } = useAppliedTheme().settings;
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const metrics = metricsOf(SEMANTIC_SIZES[idiom][density], fontScale);
  const rows = width === 0 ? [] : placeSlots(entries.map(slotOf), width, metrics);
  return (
    <View
      accessibilityLabel="Live widgets"
      className="w-full gap-2"
      onLayout={(event) => {
        setWidth(Math.floor(event.nativeEvent.layout.width));
      }}
    >
      {entries.some((entry) => entry.status === 'ready') ? <LiveCaption /> : null}
      <View className="w-full gap-grid-gap">
        {rows.map((row) => (
          <View key={row.map((placed) => placed.index).join('-')} className="flex-row gap-grid-gap">
            {row.map((placed) => {
              const entry = entries[placed.index];
              return entry === undefined ? null : (
                <LaneItem
                  key={entry.status === 'ready' ? entry.widget.key : entry.key}
                  entry={entry}
                  placed={placed}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function isBoard(widget: ChatWidget): widget is BoardChatWidget {
  return !isChatLink(widget);
}

export function MessageWidgets({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const widgets = chatWidgetsOf(row.embeds);
  const boards = widgets.filter(isBoard);
  const links = widgets.filter(isChatLink);
  return widgets.length === 0 ? null : (
    <View className="w-full gap-grid-gap">
      {boards.length === 0 ? null : <WidgetLane widgets={boards} />}
      <LinkCards links={links} />
    </View>
  );
}
