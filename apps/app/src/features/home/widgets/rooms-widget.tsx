import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { HScroller } from '../../../components/h-scroller';
import { WidgetFrame } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { Idiom } from '../../../design/tokens';
import { columnsIn, gridFit } from '../components/fit-math';
import { GridRows } from '../components/grid-rows';
import { RoomCard } from '../components/room-card';
import { useHome } from '../data/home-data';
import type { RoomSummary } from '../model/rooms';
import { bodyHeight } from '../model/widget-fit';

const CARD_MIN_WIDTH = 140;

const GRID_COLUMNS_MAX = 4;

const GRID_ROW_HEIGHT: Readonly<Record<Idiom, number>> = { touch: 118, pointer: 112 };

function widthOf(width: number): ViewStyle {
  return { width };
}

function Strip({
  rooms,
  width,
  gap,
}: {
  readonly rooms: readonly RoomSummary[];
  readonly width: number;
  readonly gap: number;
}): ReactNode {
  const across = columnsIn(width, CARD_MIN_WIDTH, gap, rooms.length);
  if (across >= rooms.length) {
    return (
      <View className="flex-1 flex-row gap-grid-gap">
        {rooms.map((room) => (
          <View key={room.id} className="min-w-0 flex-1">
            <RoomCard room={room} dense />
          </View>
        ))}
      </View>
    );
  }
  const card = Math.floor((width - gap * (across - 1)) / across);
  return (
    <HScroller label="Rooms" fill fade snapTo={card + gap}>
      {rooms.map((room) => (
        <View key={room.id} className="h-full" style={widthOf(card)}>
          <RoomCard room={room} dense />
        </View>
      ))}
    </HScroller>
  );
}

function Grid({ rooms }: { readonly rooms: readonly RoomSummary[] }): ReactNode {
  const { frame, sizes } = useWidgetFace();
  const gap = sizes.gridGap;
  const columns = columnsIn(frame.width, CARD_MIN_WIDTH, gap, GRID_COLUMNS_MAX);
  const rowHeight = GRID_ROW_HEIGHT[frame.idiom];
  const fit = gridFit(rooms.length, {
    columns,
    room: bodyHeight(frame),
    minRow: rowHeight,
    gap,
    link: sizes.controlH,
  });
  return (
    <View className="flex-1 gap-grid-gap">
      <GridRows
        items={rooms.slice(0, fit.shown)}
        keyOf={(room) => room.id}
        columns={columns}
        rowHeight={rowHeight}
        renderItem={(room) => <RoomCard room={room} dense={false} />}
      />
      {fit.more ? (
        <View className="items-start">
          <Button
            label={`All rooms (${String(rooms.length)})`}
            href={href.devices()}
            variant="text"
          />
        </View>
      ) : null}
    </View>
  );
}

export function RoomsWidget(): ReactNode {
  const rooms = useHome((view) => view.rooms);
  const { frame, cls, sizes } = useWidgetFace();
  const tall = cls === 'l' || cls === 'xl';
  return (
    <WidgetFrame title="Rooms" icon="sofa" accent="primary" href={href.devices()}>
      {tall ? (
        <Grid rooms={rooms} />
      ) : (
        <Strip rooms={rooms} width={frame.width} gap={sizes.gridGap} />
      )}
    </WidgetFrame>
  );
}
