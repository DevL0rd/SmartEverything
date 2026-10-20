import { WIDGET_TYPE } from '@smarteverything/domain';
import type { WidgetDefinition } from '../../components/widget-board';
import { DEVICE_GROUP_WIDGET } from '../device-groups';
import { APP_PLUGINS } from '../../plugins/registry';
import { CAMERA_WIDGETS } from '../cameras';
import { CLIMATE_WIDGETS } from '../climate';
import { HOME_WIDGET_SIZES, type HomeSizedType } from './model/widget-sizes';
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

function layoutOf(type: HomeSizedType): Pick<WidgetDefinition, 'sizes' | 'defaultSize'> {
  const { sizes, defaultSize } = HOME_WIDGET_SIZES[type];
  return { sizes: { compact: sizes, medium: sizes, expanded: sizes }, defaultSize };
}

class HomeWidgetTypeError extends Error {
  override readonly name = 'HomeWidgetTypeError';

  constructor(readonly type: string) {
    super(
      `The widget type ${type} cannot be saved in a board layout: use lower-case letters, digits and hyphens.`,
    );
  }
}

function checked(definition: WidgetDefinition): WidgetDefinition {
  if (!WIDGET_TYPE.safeParse(definition.type).success) {
    throw new HomeWidgetTypeError(definition.type);
  }
  return definition;
}

const HOME_CATALOGUE: readonly WidgetDefinition[] = [
  {
    type: 'glance',
    title: 'Indoors',
    icon: 'thermometer',
    group: 'Home',
    ...layoutOf('glance'),
    render: () => (
      <HomeScope field="readings">
        <GlanceWidget />
      </HomeScope>
    ),
  },
  {
    type: 'weather',
    title: 'Weather',
    icon: 'weather',
    group: 'Home',
    ...layoutOf('weather'),
    render: () => <WeatherWidget />,
  },
  SPOTLIGHT_WIDGET,
  DEVICE_GROUP_WIDGET,
  {
    type: 'favourites',
    title: 'Favourites',
    icon: 'star',
    group: 'Devices',
    ...layoutOf('favourites'),
    render: ({ editing }) => (
      <HomeScope field="favourites">
        <FavouritesWidget editing={editing} />
      </HomeScope>
    ),
  },
  ...CAMERA_WIDGETS.filter((definition) => definition.type === 'camera'),
  {
    type: 'rooms',
    title: 'Rooms',
    icon: 'grid',
    group: 'Home',
    ...layoutOf('rooms'),
    render: () => (
      <HomeScope field="rooms">
        <RoomsWidget />
      </HomeScope>
    ),
  },
  {
    type: 'activity',
    title: 'Activity',
    icon: 'activity',
    group: 'Home',
    ...layoutOf('activity'),
    render: () => (
      <HomeScope field="activity">
        <ActivityWidget />
      </HomeScope>
    ),
  },
  {
    type: 'scenes',
    title: 'Scenes',
    icon: 'sparkles',
    group: 'Home',
    ...layoutOf('scenes'),
    render: () => (
      <HomeScope field="scenes">
        <ScenesWidget />
      </HomeScope>
    ),
  },
  {
    type: 'energy',
    title: 'Energy',
    icon: 'plug',
    group: 'Home',
    ...layoutOf('energy'),
    render: () => (
      <HomeScope field="power">
        <EnergyWidget />
      </HomeScope>
    ),
  },
  {
    type: 'security',
    title: 'Security',
    icon: 'shield',
    group: 'Home',
    ...layoutOf('security'),
    render: () => (
      <HomeScope field="security">
        <SecurityWidget />
      </HomeScope>
    ),
  },
  {
    type: 'fitness-today',
    title: 'Fitness',
    icon: 'fitness',
    group: 'Health',
    ...layoutOf('fitness-today'),
    render: () => (
      <HomeScope field="fitness">
        <FitnessTodayWidget />
      </HomeScope>
    ),
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

export const HOME_WIDGETS: readonly WidgetDefinition[] = HOME_CATALOGUE.map(checked);
