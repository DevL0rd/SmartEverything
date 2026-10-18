import type { WidgetSize } from '../../../components/widget-board';

interface SizeChoice {
  readonly sizes: readonly WidgetSize[];
  readonly defaultSize: WidgetSize;
}

export const HOME_WIDGET_SIZES = {
  glance: { sizes: ['M', 'W'], defaultSize: 'M' },
  weather: { sizes: ['M', 'W', 'XL'], defaultSize: 'M' },
  favourites: { sizes: ['XL'], defaultSize: 'XL' },
  rooms: { sizes: ['M', 'W', 'XL'], defaultSize: 'M' },
  activity: { sizes: ['M', 'XL'], defaultSize: 'XL' },
  scenes: { sizes: ['M', 'W'], defaultSize: 'M' },
  energy: { sizes: ['M'], defaultSize: 'M' },
  security: { sizes: ['M', 'XL'], defaultSize: 'M' },
  'fitness-today': { sizes: ['M', 'W'], defaultSize: 'M' },
} as const satisfies Readonly<Record<string, SizeChoice>>;

export type HomeSizedType = keyof typeof HOME_WIDGET_SIZES;
