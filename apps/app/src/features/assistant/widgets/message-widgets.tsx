import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  chatWidgetKey,
  chatWidgetsOf,
  isChatLink,
  type AssistantMessageRow,
  type ChatWidget,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { useIdiom } from '../../../design/platform';
import { useAppliedTheme } from '../../../design/theme';
import type { WidgetSize } from '../../../components/widget-board';
import { useStoreSelector } from '../../../store/store-context';
import { LinkCards } from './link-card';
import { useRemoteDevice } from './remote-device';
import { resolveWidget, type BoardChatWidget, type ResolvedWidget } from './widget-sources';

const log = new Logger('app.chat-widgets');

const TWO_UP_MIN = 520;
const COMPACT_ASPECT = 1.25;

interface Box {
  readonly width: number;
  readonly height: number;
  readonly half: boolean;
}

function sizeOf(widget: ResolvedWidget, half: boolean): WidgetSize {
  if (widget.compact) {
    return 'S';
  }
  const allowed = widget.definition.sizes.compact;
  const wanted: WidgetSize = half ? 'M' : 'W';
  if (allowed.includes(wanted)) {
    return wanted;
  }
  return allowed.includes('M') ? 'M' : widget.definition.defaultSize;
}

function sizeStyle(box: Box): { readonly width: number; readonly height: number } {
  return { width: box.width, height: box.height };
}

function OneWidget({
  widget,
  box,
}: {
  readonly widget: ResolvedWidget;
  readonly box: Box;
}): ReactNode {
  const rendered = widget.definition.render({
    size: sizeOf(widget, box.half),
    options: widget.options,
    editing: false,
  });
  return (
    <View style={sizeStyle(box)} className="overflow-hidden rounded-lg">
      {widget.scope === null ? rendered : widget.scope(rendered)}
    </View>
  );
}

function useShowable(): (widget: BoardChatWidget) => boolean {
  const scenes = useStoreSelector((state) => state.tables.scenes.ids.length);
  const weather = useStoreSelector((state) => state.weather !== null);
  return (widget) =>
    (widget.kind !== 'scenes' || scenes > 0) && (widget.kind !== 'weather' || weather);
}

function isBoardWidget(widget: ChatWidget): widget is BoardChatWidget {
  return !isChatLink(widget);
}

function useResolved(widgets: readonly ChatWidget[]): readonly ResolvedWidget[] {
  const remoteDevice = useRemoteDevice();
  const showable = useShowable();
  return widgets
    .filter(isBoardWidget)
    .filter(showable)
    .flatMap((widget) => {
      const key = chatWidgetKey(widget);
      try {
        const resolved = resolveWidget(key, widget, remoteDevice);
        return resolved === null ? [] : [resolved];
      } catch (cause) {
        log.error('chat_widgets.resolve_failed', cause, { kind: widget.kind });
        return [];
      }
    });
}

interface Unit {
  readonly gap: number;
  readonly height: number;
}

function boxesOf(widgets: readonly ResolvedWidget[], width: number, unit: Unit): Box[] {
  const twoUp = width >= TWO_UP_MIN;
  return widgets.map((widget) => {
    const { aspect } = widget.definition;
    if (aspect !== undefined) {
      return { width, height: Math.round(width / aspect), half: false };
    }
    const half = widget.compact || (twoUp && !widget.wide);
    const halfWidth = (width - unit.gap) / 2;
    const tile = widget.compact ? Math.min(halfWidth, unit.height * COMPACT_ASPECT) : halfWidth;
    return { width: half ? tile : width, height: unit.height, half };
  });
}

function WidgetGrid({ widgets }: { readonly widgets: readonly ChatWidget[] }): ReactNode {
  const resolved = useResolved(widgets);
  const idiom = useIdiom();
  const { density } = useAppliedTheme().settings;
  const [width, setWidth] = useState(0);
  if (resolved.length === 0) {
    return null;
  }
  const sizes = SEMANTIC_SIZES[idiom][density];
  const unit = { gap: sizes.gridGap, height: sizes.rowUnit * 2 + sizes.gridGap };
  const boxes = boxesOf(resolved, width, unit);
  return (
    <View
      accessibilityLabel="Live widgets"
      className="w-full flex-row flex-wrap gap-grid-gap"
      onLayout={(event) => {
        setWidth(Math.floor(event.nativeEvent.layout.width));
      }}
    >
      {width === 0
        ? null
        : resolved.map((widget, index) => {
            const box = boxes[index];
            return box === undefined ? null : (
              <OneWidget key={widget.key} widget={widget} box={box} />
            );
          })}
    </View>
  );
}

export function MessageWidgets({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const widgets = chatWidgetsOf(row.embeds);
  const links = widgets.filter(isChatLink);
  return widgets.length === 0 ? null : (
    <View className="w-full gap-grid-gap">
      <WidgetGrid widgets={widgets} />
      <LinkCards links={links} />
    </View>
  );
}
