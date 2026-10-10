import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { WidgetSize } from '@smarteverything/domain';
import { WidgetFrame } from '../../../components/widget-board';
import { DeviceTile } from '../../devices';
import { VisualVisibility } from '../../device-visuals';
import { FitGrid } from '../components/fit-grid';
import { unspotlighted, useHome } from '../data/home-data';

export function FavouritesWidget({
  size,
  editing,
}: {
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const home = useHome((view) => view);
  const devices = unspotlighted(home);
  return (
    <WidgetFrame
      title={home.favourites.title}
      icon="star"
      accent="warning"
      href={href.devices()}
      size={size}
    >
      <VisualVisibility visible={!editing}>
        <FitGrid
          items={devices}
          keyOf={(device) => device.id}
          minItemWidth={156}
          maxColumns={4}
          renderItem={(device) => <DeviceTile device={device} inset />}
          fill
        />
      </VisualVisibility>
    </WidgetFrame>
  );
}
