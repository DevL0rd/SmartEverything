import type { ReactNode } from 'react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { eventLook } from '../../activity';
import { Playhead, ScrubPreview } from './playhead';
import {
  hourTicks,
  marksAlong,
  nearest,
  trackWidth,
  zoomStep,
  type TrackItem,
  type TrackMark,
  type ZoomHours,
} from '../logic/timeline-track';

const MARK_SIZE = 32;

interface Place {
  readonly left: number;
  readonly width?: number;
  readonly height?: number;
}

function widthOf(width: number): { readonly width: number } {
  return { width };
}

function placeOf(left: number, size?: number): Place {
  return size === undefined ? { left } : { left, width: size, height: size };
}
const TOUCH_MARK = 40;

export interface TimelineStripProps {
  readonly items: readonly TrackItem[];
  readonly now: number | null;
  readonly label: string;
  readonly onOpen: (id: string) => void;
}

function Mark({
  mark,
  size,
  onOpen,
}: {
  readonly mark: TrackMark;
  readonly size: number;
  readonly onOpen: (id: string) => void;
}): ReactNode {
  const look = eventLook(mark.kind, mark.details);
  const count = mark.ids.length;
  return (
    <View style={placeOf(mark.x - size / 2, size)} className="absolute top-2">
      <Interactive
        label={count > 1 ? `${String(count)} events, open the first` : `${look.label}, open`}
        onPress={() => {
          onOpen(mark.id);
        }}
        className="h-full w-full items-center justify-center rounded-full border-hairline border-outline bg-surface-raised"
        layerClassName="rounded-full"
      >
        <Icon name={look.icon} size={16} tone={look.tone} />
      </Interactive>
      {count > 1 ? (
        <View
          pointerEvents="none"
          className="absolute -right-1 -top-1 min-w-5 items-center rounded-full bg-primary px-1"
        >
          <Text variant="caption" tone="onPrimary">
            {String(count)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Ticks({ hours, width }: { readonly hours: ZoomHours; readonly width: number }): ReactNode {
  return hourTicks(hours).map((hour) => (
    <View key={hour} style={placeOf((hour / 24) * width)} className="absolute bottom-0 top-12 w-px">
      <View className="h-2 w-px bg-outline" />
      <Text variant="caption" tone="faint" className="absolute top-2 -ml-4 w-8 text-center">
        {String(hour % 24).padStart(2, '0')}
      </Text>
    </View>
  ));
}

function useCentred(
  width: number,
  viewport: number,
  focus: number | null,
): RefObject<ScrollView | null> {
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (focus === null || viewport === 0) {
      return;
    }
    scroll.current?.scrollTo({ x: Math.max(0, focus * width - viewport / 2), animated: false });
  }, [width, viewport, focus]);
  return scroll;
}

function ZoomBar({
  hours,
  setHours,
}: {
  readonly hours: ZoomHours;
  readonly setHours: (hours: ZoomHours) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center justify-end gap-1">
      <Text variant="footnote" tone="variant" className="flex-1">
        {hours === 24 ? 'Whole day' : `${String(hours)} h at a time`}
      </Text>
      <IconButton
        icon="minus"
        label="Show more of the day"
        disabled={hours === 24}
        onPress={() => {
          setHours(zoomStep(hours, -1));
        }}
      />
      <IconButton
        icon="plus"
        label="Show less of the day"
        disabled={hours === 1}
        onPress={() => {
          setHours(zoomStep(hours, 1));
        }}
      />
    </View>
  );
}

interface TrackProps extends TimelineStripProps {
  readonly hours: ZoomHours;
  readonly head: number;
  readonly onMove: (fraction: number) => void;
  readonly onRelease: (fraction: number) => void;
}

function Track({ items, now, onOpen, hours, head, onMove, onRelease }: TrackProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const [viewport, setViewport] = useState(0);
  const width = trackWidth(viewport, hours);
  const size = touch ? TOUCH_MARK : MARK_SIZE;
  const latest = items.reduce<number | null>(
    (max, item) => Math.max(max ?? 0, item.fraction),
    null,
  );
  const scroll = useCentred(width, viewport, now ?? latest);
  return (
    <View
      onLayout={(event) => {
        setViewport(event.nativeEvent.layout.width);
      }}
      className="h-20 overflow-hidden rounded-lg bg-surface-2"
    >
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}>
        <View style={widthOf(width)} className="h-20">
          <View className="absolute inset-x-0 top-12 h-px bg-outline-variant" />
          <Ticks hours={hours} width={width} />
          {now === null ? null : (
            <View
              style={placeOf(now * width)}
              className="absolute bottom-0 top-0 w-px bg-outline"
            />
          )}
          {marksAlong(items, width, size + 4).map((mark) => (
            <Mark key={mark.id} mark={mark} size={size} onOpen={onOpen} />
          ))}
          <Playhead fraction={head} width={width} onMove={onMove} onRelease={onRelease} />
        </View>
      </ScrollView>
    </View>
  );
}

function startOf({ items, now }: TimelineStripProps): number {
  return now ?? items.reduce((max, item) => Math.max(max, item.fraction), 0);
}

export function TimelineStrip(props: TimelineStripProps): ReactNode {
  const [hours, setHours] = useState<ZoomHours>(24);
  const [head, setHead] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const shown = head ?? startOf(props);
  return (
    <View accessibilityLabel={props.label} className="gap-1">
      <ZoomBar hours={hours} setHours={setHours} />
      {scrubbing ? <ScrubPreview items={props.items} fraction={shown} /> : null}
      <Track
        {...props}
        hours={hours}
        head={shown}
        onMove={(fraction) => {
          setScrubbing(true);
          setHead(fraction);
        }}
        onRelease={(fraction) => {
          setScrubbing(false);
          setHead(fraction);
          const item = nearest(props.items, fraction);
          if (item !== null) {
            props.onOpen(item.id);
          }
        }}
      />
    </View>
  );
}
