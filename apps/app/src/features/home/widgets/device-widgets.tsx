import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { DeviceTile } from '../../devices';
import { VisualVisibility } from '../../../design/visibility';
import { linkedCapacity, tileGrid } from '../components/fit-math';
import { GridRows } from '../components/grid-rows';
import { unspotlighted, useHome } from '../data/home-data';
import { bodyHeight } from '../model/widget-fit';

function AllLink({
  chosen,
  count,
}: {
  readonly chosen: boolean;
  readonly count: number;
}): ReactNode {
  return (
    <View className="items-start">
      <Button
        label={chosen ? `All favourites (${String(count)})` : 'All devices'}
        href={href.devices()}
        variant="text"
      />
    </View>
  );
}

export function FavouritesWidget({ editing }: { readonly editing: boolean }): ReactNode {
  const favourites = useHome((view) => view.favourites);
  const spotlighted = useHome((view) => view.spotlighted);
  const { frame, sizes } = useWidgetFace();
  const devices = unspotlighted(favourites, spotlighted);
  const grid = tileGrid(frame.width, frame.idiom, sizes.gridGap);
  const capacity = linkedCapacity({
    ...grid,
    room: bodyHeight(frame),
    link: sizes.controlH,
  });
  return (
    <WidgetFrame title={favourites.title} icon="star" accent="warning" href={href.devices()}>
      {devices.length === 0 ? (
        <WidgetEmpty
          icon="star"
          colour="warning"
          title="Star devices to see them here"
          action={{ label: 'Open Devices', href: href.devices() }}
        />
      ) : (
        <View className="flex-1 gap-grid-gap">
          <VisualVisibility visible={!editing}>
            <GridRows
              items={devices.slice(0, capacity)}
              keyOf={(device) => device.id}
              columns={grid.columns}
              renderItem={(device) => <DeviceTile device={device} inset />}
            />
          </VisualVisibility>
          <AllLink chosen={favourites.chosen} count={devices.length} />
        </View>
      )}
    </WidgetFrame>
  );
}
