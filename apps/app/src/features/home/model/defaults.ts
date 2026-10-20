import type { BoardDefaults, BoardWidget, WidgetSize } from '../../../components/widget-board';
import { lightGroupWidgets, type LightGroupDefault } from '../../device-groups';
import type { CameraEntry } from '../../cameras';
import type { DeviceDigest } from './spotlight';

export const HOME_PAGE = 'home';

export const HOME_RETIRED: ReadonlySet<string> = new Set(['devices-all']);

function spotlights(digest: DeviceDigest, first: WidgetSize): readonly BoardWidget[] {
  return digest.featured.map((deviceId, index) => ({
    key: `spotlight:${deviceId}`,
    type: 'spotlight',
    size: index === 0 ? first : 'M',
    options: { deviceId },
  }));
}

function cameraTiles(cameras: readonly CameraEntry[], size: WidgetSize): readonly BoardWidget[] {
  return cameras.map((entry) => ({
    key: `camera:${entry.device.id}`,
    type: 'camera',
    size,
    options: { deviceId: entry.device.id },
  }));
}

function widget(type: string, size: WidgetSize): BoardWidget {
  return { key: type, type, size };
}

const TAIL: readonly BoardWidget[] = [
  widget('fitness-today', 'M'),
  widget('body', 'M'),
  widget('watch', 'M'),
  widget('energy', 'M'),
  widget('security', 'M'),
];

export function homeDefaults(
  digest: DeviceDigest,
  cameras: readonly CameraEntry[],
  lightGroups: readonly LightGroupDefault[] = [],
): BoardDefaults {
  return {
    compact: [
      widget('glance', 'W'),
      widget('weather', 'W'),
      widget('scenes', 'W'),
      ...spotlights(digest, 'XL'),
      ...lightGroupWidgets(lightGroups),
      widget('favourites', 'XL'),
      ...cameraTiles(cameras, 'M'),
      widget('rooms', 'M'),
      widget('activity', 'XL'),
      ...TAIL,
    ],
    medium: [
      widget('glance', 'M'),
      widget('weather', 'M'),
      widget('scenes', 'M'),
      ...spotlights(digest, 'XL'),
      ...lightGroupWidgets(lightGroups),
      widget('favourites', 'XL'),
      ...cameraTiles(cameras, 'M'),
      widget('rooms', 'M'),
      widget('activity', 'XL'),
      ...TAIL,
    ],
    expanded: [
      widget('glance', 'M'),
      widget('weather', 'M'),
      widget('scenes', 'M'),
      ...spotlights(digest, 'XL'),
      ...lightGroupWidgets(lightGroups),
      widget('favourites', 'XL'),
      widget('activity', 'XL'),
      ...cameraTiles(cameras, 'M'),
      widget('rooms', 'M'),
      ...TAIL,
    ],
  };
}
