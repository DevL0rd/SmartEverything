import type { WidgetDefinition } from '../../../components/widget-board';
import { CalendarFace } from './calendar-face';
import { LiveFace } from './live-faces';
import { ProgressFace } from './progress-faces';
import { TreadmillWidgetShell } from './widget-shell';

export const TREADMILL_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'treadmill-live',
    title: 'Treadmill',
    icon: 'footprints',
    group: 'Devices',
    sizes: {
      compact: ['M', 'XL'],
      medium: ['M', 'W', 'XL'],
      expanded: ['M', 'W', 'XL'],
    },
    defaultSize: 'M',
    render: () => (
      <TreadmillWidgetShell title="Treadmill" icon="footprints">
        {(device, view) => <LiveFace device={device} view={view} />}
      </TreadmillWidgetShell>
    ),
  },
  {
    type: 'treadmill-progress',
    title: 'Treadmill goals',
    icon: 'trophy',
    group: 'Devices',
    sizes: {
      compact: ['M', 'XL'],
      medium: ['M', 'W', 'XL'],
      expanded: ['M', 'W', 'XL'],
    },
    defaultSize: 'M',
    render: () => (
      <TreadmillWidgetShell title="Treadmill goals" icon="trophy" live={false}>
        {(device) => <ProgressFace deviceId={device.id} />}
      </TreadmillWidgetShell>
    ),
  },
  {
    type: 'treadmill-calendar',
    title: 'Treadmill calendar',
    icon: 'calendar',
    group: 'Devices',
    sizes: {
      compact: ['XL'],
      medium: ['W', 'XL'],
      expanded: ['W', 'XL'],
    },
    defaultSize: 'W',
    render: () => (
      <TreadmillWidgetShell title="Treadmill calendar" icon="calendar" live={false}>
        {(device) => <CalendarFace deviceId={device.id} />}
      </TreadmillWidgetShell>
    ),
  },
];
