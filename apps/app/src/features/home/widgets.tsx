import { WIDGET_TYPE } from '@smarteverything/domain';
import type {
  BoardClass,
  BoardDefaults,
  BoardWidget,
  WidgetDefinition,
  WidgetSize,
} from '../../components/widget-board';
import { APP_PLUGINS } from '../../plugins/registry';
import { CAMERA_WIDGETS, type CameraEntry } from '../cameras';
import { CLIMATE_WIDGETS } from '../climate';
import type { DeviceDigest } from './model/spotlight';
import { nutritionWidgets, useTodayKey } from '../nutrition';
import { BODY_WIDGET } from '../fitness';
import { PHONE_WIDGET } from '../phone';
import { TALK_WIDGETS } from '../talk';
import { STRESS_WIDGET, WATCH_WIDGET, WATCH_WORKOUT_WIDGET } from '../watches';
import { WeatherWidget } from '../weather';
import { FavouritesWidget } from './widgets/device-widgets';
import { GlanceWidget } from './widgets/glance-widget';
import { HomeScope } from './widgets/home-scope';
import { RoomsWidget } from './widgets/rooms-widget';
import { SPOTLIGHT_WIDGET } from './widgets/spotlight';
import {
  ActivityWidget,
  EnergyWidget,
  FitnessTodayWidget,
  ScenesWidget,
  SecurityWidget,
} from './widgets/summary-widgets';

export const HOME_PAGE = 'home';

function sizes(
  ...allowed: readonly WidgetSize[]
): Readonly<Record<BoardClass, readonly WidgetSize[]>> {
  return { compact: allowed, medium: allowed, expanded: allowed };
}

class HomeWidgetTypeError extends Error {
  override readonly name = 'HomeWidgetTypeError';

  constructor(readonly type: string) {
    super(
      `The widget type ${type} cannot be saved in a board layout: use lower-case letters, digits and hyphens.`,
    );
  }
}

function scoped(definition: WidgetDefinition): WidgetDefinition {
  if (!WIDGET_TYPE.safeParse(definition.type).success) {
    throw new HomeWidgetTypeError(definition.type);
  }
  return {
    ...definition,
    render: (props) => <HomeScope>{definition.render(props)}</HomeScope>,
  };
}

const HOME_CATALOGUE: readonly WidgetDefinition[] = [
  {
    type: 'glance',
    title: 'Indoors',
    icon: 'thermometer',
    group: 'Home',
    sizes: sizes('W'),
    defaultSize: 'W',
    render: ({ size }) => <GlanceWidget size={size} />,
  },
  {
    type: 'weather',
    title: 'Weather',
    icon: 'weather',
    group: 'Home',
    sizes: sizes('S', 'M', 'W', 'L', 'XL'),
    defaultSize: 'W',
    render: ({ size }) => <WeatherWidget size={size} />,
  },
  SPOTLIGHT_WIDGET,
  {
    type: 'favourites',
    title: 'Favourites',
    icon: 'star',
    group: 'Devices',
    sizes: sizes('L', 'XL'),
    defaultSize: 'L',
    render: ({ size, editing }) => <FavouritesWidget size={size} editing={editing} />,
  },
  ...CAMERA_WIDGETS.filter((definition) => definition.type === 'camera'),
  {
    type: 'rooms',
    title: 'Rooms',
    icon: 'grid',
    group: 'Home',
    sizes: sizes('M', 'L', 'W'),
    defaultSize: 'M',
    render: ({ size }) => <RoomsWidget size={size} />,
  },
  {
    type: 'activity',
    title: 'Activity',
    icon: 'activity',
    group: 'Home',
    sizes: sizes('M', 'L', 'XL'),
    defaultSize: 'L',
    render: ({ size }) => <ActivityWidget size={size} />,
  },
  {
    type: 'scenes',
    title: 'Scenes',
    icon: 'sparkles',
    group: 'Home',
    sizes: sizes('M', 'L', 'W'),
    defaultSize: 'W',
    render: ({ size }) => <ScenesWidget size={size} />,
  },
  {
    type: 'energy',
    title: 'Energy',
    icon: 'plug',
    group: 'Home',
    sizes: sizes('S', 'M'),
    defaultSize: 'M',
    render: ({ size }) => <EnergyWidget size={size} />,
  },
  {
    type: 'security',
    title: 'Security',
    icon: 'shield',
    group: 'Home',
    sizes: sizes('M', 'L'),
    defaultSize: 'M',
    render: ({ size }) => <SecurityWidget size={size} />,
  },
  {
    type: 'fitness-today',
    title: 'Fitness',
    icon: 'fitness',
    group: 'Health',
    sizes: sizes('S', 'M', 'W'),
    defaultSize: 'M',
    render: ({ size }) => <FitnessTodayWidget size={size} />,
  },
  { ...BODY_WIDGET, group: 'Health' },
  { ...WATCH_WIDGET, group: 'Health' },
  { ...STRESS_WIDGET, group: 'Health' },
  { ...WATCH_WORKOUT_WIDGET, group: 'Health' },
  ...nutritionWidgets(useTodayKey, 'Health'),
  ...TALK_WIDGETS,
  { ...PHONE_WIDGET, group: 'Devices' },
  ...CLIMATE_WIDGETS,
  ...APP_PLUGINS.filter((plugin) => plugin.home !== undefined).flatMap((plugin) => plugin.widgets),
];

export const HOME_RETIRED: ReadonlySet<string> = new Set(['devices-all']);

export const HOME_WIDGETS: readonly WidgetDefinition[] = HOME_CATALOGUE.map(scoped);

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

export function homeDefaults(digest: DeviceDigest, cameras: readonly CameraEntry[]): BoardDefaults {
  return {
    compact: [
      widget('glance', 'W'),
      widget('weather', 'W'),
      widget('scenes', 'W'),
      ...spotlights(digest, 'L'),
      widget('favourites', 'L'),
      ...cameraTiles(cameras, 'M'),
      widget('rooms', 'M'),
      widget('activity', 'L'),
      ...TAIL,
    ],
    medium: [
      widget('glance', 'W'),
      widget('weather', 'W'),
      widget('scenes', 'W'),
      ...spotlights(digest, 'L'),
      widget('favourites', 'XL'),
      ...cameraTiles(cameras, 'M'),
      widget('rooms', 'M'),
      widget('activity', 'L'),
      ...TAIL,
    ],
    expanded: [
      widget('glance', 'W'),
      widget('weather', 'W'),
      widget('scenes', 'W'),
      ...spotlights(digest, 'L'),
      widget('favourites', 'L'),
      widget('activity', 'L'),
      ...cameraTiles(cameras, 'M'),
      widget('rooms', 'M'),
      ...TAIL,
    ],
  };
}
