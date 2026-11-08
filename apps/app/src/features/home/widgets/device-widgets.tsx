import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { WidgetEmpty, WidgetFrame, widgetBodyHeight } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { DeviceTile, deviceTileGrid } from '../../devices';
import { VisualVisibility } from '../../../design/visibility';
import { linkedCapacity } from '../components/fit-math';
import { GridRows } from '../components/grid-rows';
import { unspotlighted, useHome } from '../data/home-data';

function AllLink({
  chosen,
  count,
}: {
  readonly chosen: boolean;
  readonly count: number;
}): ReactNode {
  return (
    <Button
      label={chosen ? `All favourites (${String(count)})` : 'All devices'}
      href={href.devices()}
      variant="text"
    />
  );
}

export function FavouritesWidget({ editing }: { readonly editing: boolean }): ReactNode {
  const favourites = useHome((view) => view.favourites);
  const spotlighted = useHome((view) => view.spotlighted);
  const { frame, sizes } = useWidgetFace();
  const devices = unspotlighted(favourites, spotlighted);
  const grid = deviceTileGrid({
    width: frame.width,
    idiom: frame.idiom,
    sizes,
    count: devices.length,
  });
  const capacity = linkedCapacity({ ...grid, room: widgetBodyHeight(frame), link: sizes.controlH });
  const header = {
    title: favourites.title,
    icon: 'star',
    accent: 'warning',
    href: href.devices(),
  } as const;
  return devices.length === 0 ? (
    <WidgetFrame {...header}>
      <WidgetEmpty
        icon="star"
        colour="warning"
        title="Star devices to see them here"
        action={{ label: 'Open Devices', href: href.devices() }}
      />
    </WidgetFrame>
  ) : (
    <WidgetFrame
      {...header}
      actions={<AllLink chosen={favourites.chosen} count={devices.length} />}
    >
      <View className="mb-grid-gap flex-1">
        <VisualVisibility visible={!editing}>
          <GridRows
            items={devices.slice(0, capacity)}
            keyOf={(device) => device.id}
            columns={grid.columns}
            renderItem={(device) => <DeviceTile device={device} inset />}
          />
        </VisualVisibility>
      </View>
    </WidgetFrame>
  );
}
