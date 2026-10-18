import type { ReactNode } from 'react';
import type { WidgetDefinition } from '../../../components/widget-board';
import { allSizes } from '../../../components/widget-board/all-sizes';
import { chartedMetric } from '../data/air-history';
import { useClimateModels } from '../model/climate-devices';
import { AirChartWidget } from './air-chart-widget';
import { AirQualityWidget } from './air-quality-widget';
import { ComfortWidget } from './comfort-widget';
import { OutdoorWidget } from './outdoor-widget';
import { SuppliesWidget } from './supplies-widget';

function HomeAirChart(): ReactNode {
  const metric = chartedMetric(useClimateModels(null));
  return metric === null ? null : <AirChartWidget metric={metric} room={null} />;
}

export const CLIMATE_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'air-quality',
    title: 'Air quality',
    icon: 'airVent',
    group: 'Climate',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    render: ({ size }) => <AirQualityWidget size={size} room={null} />,
  },
  {
    type: 'comfort',
    title: 'Indoor comfort',
    icon: 'thermometer',
    group: 'Climate',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    render: ({ size }) => <ComfortWidget size={size} room={null} />,
  },
  {
    type: 'outdoor',
    title: 'Inside & outside',
    icon: 'weather',
    group: 'Climate',
    sizes: { ...allSizes('M', 'XL'), expanded: ['M', 'W', 'XL'] },
    defaultSize: 'W',
    render: ({ size }) => <OutdoorWidget size={size} room={null} />,
  },
  {
    type: 'air-chart',
    title: 'Air today',
    icon: 'activity',
    group: 'Climate',
    sizes: { ...allSizes('M', 'XL'), expanded: ['M', 'XL'] },
    defaultSize: 'XL',
    render: () => <HomeAirChart />,
  },
  {
    type: 'supplies',
    title: 'Filters & water',
    icon: 'wrench',
    group: 'Climate',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'W',
    render: ({ size }) => <SuppliesWidget size={size} room={null} />,
  },
];
