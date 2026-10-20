import type { WidgetDefinition } from '../../../components/widget-board';
import { HeadFace } from './head-face';
import { LiveFace } from './live-faces';
import { StatsFace } from './stats-face';
import { TodayFace } from './today-face';
import { BrushWidgetShell } from './widget-shell';

const SIZES = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
} as const;

const SMALL_SIZES = {
  compact: ['M'],
  medium: ['M', 'W'],
  expanded: ['M', 'W'],
} as const;

export const BRUSH_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'toothbrush-live',
    title: 'Toothbrush',
    icon: 'toothbrush',
    group: 'Devices',
    sizes: SIZES,
    defaultSize: 'M',
    render: () => (
      <BrushWidgetShell title="Toothbrush" icon="toothbrush">
        {(device, view) => <LiveFace device={device} view={view} />}
      </BrushWidgetShell>
    ),
  },
  {
    type: 'toothbrush-today',
    title: 'Brushing today',
    icon: 'calendar',
    group: 'Devices',
    sizes: SIZES,
    defaultSize: 'M',
    render: () => (
      <BrushWidgetShell title="Brushing today" icon="calendar" live={false}>
        {(device, view) => <TodayFace deviceId={device.id} view={view} />}
      </BrushWidgetShell>
    ),
  },
  {
    type: 'toothbrush-stats',
    title: 'Brushing score',
    icon: 'trendUp',
    group: 'Devices',
    sizes: SIZES,
    defaultSize: 'M',
    render: () => (
      <BrushWidgetShell title="Brushing score" icon="trendUp" live={false}>
        {(device, view) => <StatsFace deviceId={device.id} view={view} />}
      </BrushWidgetShell>
    ),
  },
  {
    type: 'toothbrush-head',
    title: 'Brush head',
    icon: 'toothbrush',
    group: 'Devices',
    sizes: SMALL_SIZES,
    defaultSize: 'M',
    render: () => (
      <BrushWidgetShell title="Brush head" icon="toothbrush">
        {(device, view) => <HeadFace device={device} view={view} />}
      </BrushWidgetShell>
    ),
  },
];
