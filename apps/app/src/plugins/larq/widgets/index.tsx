import type { WidgetDefinition } from '../../../components/widget-board';
import { allSizes } from '../../../components/widget-board/all-sizes';
import { BottleFace } from './bottle-faces';
import { CalendarFace, ProgressFace } from './hydration-faces';
import { BottleWidgetShell } from './widget-shell';

export const LARQ_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'bottle',
    title: 'Water bottle',
    icon: 'glassWater',
    group: 'Devices',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    render: () => (
      <BottleWidgetShell title="Water bottle" icon="glassWater">
        {(device, view) => <BottleFace device={device} view={view} />}
      </BottleWidgetShell>
    ),
  },
  {
    type: 'hydration-progress',
    title: 'Hydration',
    icon: 'droplet',
    group: 'Health',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    render: () => (
      <BottleWidgetShell title="Hydration" icon="droplet">
        {(device, view) => <ProgressFace device={device} view={view} />}
      </BottleWidgetShell>
    ),
  },
  {
    type: 'hydration-calendar',
    title: 'Hydration calendar',
    icon: 'calendar',
    group: 'Health',
    sizes: allSizes('W', 'XL'),
    defaultSize: 'W',
    render: () => (
      <BottleWidgetShell title="Hydration calendar" icon="calendar">
        {(device, view) => <CalendarFace device={device} view={view} />}
      </BottleWidgetShell>
    ),
  },
];
