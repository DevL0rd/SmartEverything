import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { columnsFor } from '../../../components/grid';
import { HScroller } from '../../../components/h-scroller';
import { WidgetFrame, type WidgetSize } from '../../../components/widget-board';
import { RoomCard } from '../components/room-card';
import { useHome } from '../data/home-data';

const CARD_MIN = 150;
const GAP = 12;

export function RoomsWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const { rooms } = useHome();
  const [width, setWidth] = useState(0);
  const fits = columnsFor(width, CARD_MIN, GAP, rooms.length) >= rooms.length;
  const dense = size !== 'L';
  return (
    <WidgetFrame title="Rooms" icon="sofa" accent="primary" href={href.devices()} size={size}>
      <View
        className="flex-1"
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
      >
        {fits ? (
          <View className="flex-1 flex-row gap-3">
            {rooms.map((room) => (
              <View key={room.id} className="min-w-0 flex-1">
                <RoomCard room={room} dense={dense} />
              </View>
            ))}
          </View>
        ) : (
          <HScroller label="Rooms" fill>
            {rooms.map((room) => (
              <View key={room.id} className="h-full w-48">
                <RoomCard room={room} dense={dense} />
              </View>
            ))}
          </HScroller>
        )}
      </View>
    </WidgetFrame>
  );
}
