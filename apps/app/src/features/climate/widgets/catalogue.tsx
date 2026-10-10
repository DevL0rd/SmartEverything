import type { ReactNode } from 'react';
import type { BoardClass, WidgetDefinition, WidgetSize } from '../../../components/widget-board';
import { chartedMetric } from '../data/air-history';
import { useClimateSources } from '../model/climate-devices';
import { AirChartWidget } from './air-chart-widget';
import { AirQualityWidget } from './air-quality-widget';
import { ComfortWidget } from './comfort-widget';
import { OutdoorWidget } from './outdoor-widget';
import { SuppliesWidget } from './supplies-widget';

function sizes(
  compact: readonly WidgetSize[],
  expanded: readonly WidgetSize[] = compact,
): Readonly<Record<BoardClass, readonly WidgetSize[]>> {
  return { compact, medium: compact, expanded };
}

function HomeAirChart({ size }: { readonly size: WidgetSize }): ReactNode {
  const metric = chartedMetric(useClimateSources(null));
  return metric === null ? null : <AirChartWidget metric={metric} room={null} size={size} />;
}

export const CLIMATE_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'air-quality',
    title: 'Air quality',
    icon: 'airVent',
    group: 'Climate',
    sizes: sizes(['S', 'M', 'W', 'L']),
    defaultSize: 'M',
    render: ({ size }) => <AirQualityWidget size={size} room={null} />,
  },
  {
    type: 'comfort',
    title: 'Indoor comfort',
    icon: 'thermometer',
    group: 'Climate',
    sizes: sizes(['S', 'M', 'W', 'L']),
    defaultSize: 'M',
    render: ({ size }) => <ComfortWidget size={size} room={null} />,
  },
  {
    type: 'outdoor',
    title: 'Inside & outside',
    icon: 'weather',
    group: 'Climate',
    sizes: sizes(['M', 'L'], ['M', 'W', 'L', 'XL']),
    defaultSize: 'W',
    render: ({ size }) => <OutdoorWidget size={size} room={null} />,
  },
  {
    type: 'air-chart',
    title: 'Air today',
    icon: 'activity',
    group: 'Climate',
    sizes: sizes(['M', 'L'], ['M', 'L', 'XL']),
    defaultSize: 'L',
    render: ({ size }) => <HomeAirChart size={size} />,
  },
  {
    type: 'supplies',
    title: 'Filters & water',
    icon: 'wrench',
    group: 'Climate',
    sizes: sizes(['M', 'W', 'L']),
    defaultSize: 'W',
    render: ({ size }) => <SuppliesWidget size={size} room={null} />,
  },
];
