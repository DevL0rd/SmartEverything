import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  chatWidgetsOf,
  isChatLink,
  type AssistantMessageRow,
  type ChatWidget,
  WIDGET_FOOTPRINTS,
} from '@smarteverything/domain';
import { SEMANTIC_SIZES, type SemanticSizes } from '../../../design/tokens';
import { useIdiom } from '../../../design/platform';
import { useThemeSetting } from '../../../design/theme';
import { renderWidget, type WidgetSize } from '../../../components/widget-board';
import { LinkCards } from './link-card';
import { frameOfPlaced, type LaneFrameContext } from './lane-frame';
import { useLaneEntries, type LaneEntry } from './lane-entries';
import { placeSlots, type Metrics, type Placed, type Slot } from './lane-layout';
import { LiveCaption } from './live-caption';
import { UnavailableTile } from './unavailable-tile';
import { type BoardChatWidget, type ResolvedWidget } from './widget-sources';

function sizeOf(widget: ResolvedWidget, shared: boolean): WidgetSize {
  if (widget.compact) {
    return 'M';
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
    return { kind: 'note', aspect: null, rows: 0 };
  }
  const { widget } = entry;
  const { aspect } = widget.definition;
  const rows = WIDGET_FOOTPRINTS.compact[sizeOf(widget, false)].rows;
  if (aspect !== undefined) {
    return { kind: 'wide', aspect, rows };
  }
  if (widget.compact) {
    return { kind: 'tile', aspect: null, rows };
  }
  return { kind: widget.wide ? 'wide' : 'half', aspect: null, rows };
}

function metricsOf(sizes: SemanticSizes): Metrics {
  return { gap: sizes.gridGap, line: sizes.rowUnit };
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
  frame,
}: {
  readonly widget: ResolvedWidget;
  readonly placed: Placed;
  readonly frame: LaneFrameContext;
}): ReactNode {
  const rendered = renderWidget(
    widget.definition,
    {
      size: sizeOf(widget, placed.shared),
      options: widget.options,
      editing: false,
      frame: frameOfPlaced(placed, frame),
    },
    null,
  );
  return (
    <View style={boxStyle(placed)} className="overflow-hidden rounded-lg">
      {widget.scope === null ? rendered : widget.scope(rendered)}
    </View>
  );
}

function LaneItem({
  entry,
  placed,
  frame,
}: {
  readonly entry: LaneEntry;
  readonly placed: Placed;
  readonly frame: LaneFrameContext;
}): ReactNode {
  return entry.status === 'ready' ? (
    <OneWidget widget={entry.widget} placed={placed} frame={frame} />
  ) : (
    <UnavailableTile entry={entry} />
  );
}

function WidgetLane({ widgets }: { readonly widgets: readonly BoardChatWidget[] }): ReactNode {
  const entries = useLaneEntries(widgets);
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  const [width, setWidth] = useState(0);
  const sizes = SEMANTIC_SIZES[idiom][density];
  const metrics = metricsOf(sizes);
  const frame: LaneFrameContext = { idiom, padding: sizes.cardPad };
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
                  frame={frame}
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
