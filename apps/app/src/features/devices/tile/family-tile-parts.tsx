import type { ComponentType } from 'react';
import type { DeviceFamily } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { LightTileBar, LightTileCorner } from '../faces/light-tile-parts';
import { LaundryTileBar } from '../laundry/tile-bar';

interface TileParts {
  readonly bar?: ComponentType<{ readonly device: Device }>;
  readonly corner?: ComponentType<{ readonly device: Device }>;
}

export const FAMILY_TILE_PARTS: Readonly<Partial<Record<DeviceFamily, TileParts>>> = {
  light: { bar: LightTileBar, corner: LightTileCorner },
  laundry: { bar: LaundryTileBar },
};
