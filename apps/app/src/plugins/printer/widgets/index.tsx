import type { WidgetDefinition } from '../../../components/widget-board';
import { ActivityFace } from './activity-face';
import { StatusFace } from './status-face';
import { SuppliesFace } from './supplies-face';
import { PrinterWidgetShell } from './widget-shell';

const WIDE = { compact: ['XL'], medium: ['W', 'XL'], expanded: ['W', 'XL'] } as const;

export const PRINTER_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'printer-status',
    title: 'Printer',
    icon: 'printer',
    group: 'Devices',
    sizes: WIDE,
    defaultSize: 'W',
    render: () => (
      <PrinterWidgetShell title="Printer" icon="printer">
        {(device) => <StatusFace device={device} />}
      </PrinterWidgetShell>
    ),
  },
  {
    type: 'printer-supplies',
    title: 'Printer supplies',
    icon: 'droplet',
    group: 'Devices',
    sizes: WIDE,
    defaultSize: 'W',
    render: () => (
      <PrinterWidgetShell title="Printer supplies" icon="droplet">
        {(device) => <SuppliesFace device={device} />}
      </PrinterWidgetShell>
    ),
  },
  {
    type: 'printer-activity',
    title: 'Printer activity',
    icon: 'calendar',
    group: 'Devices',
    sizes: WIDE,
    defaultSize: 'W',
    render: () => (
      <PrinterWidgetShell title="Printer activity" icon="calendar">
        {(device) => <ActivityFace device={device} />}
      </PrinterWidgetShell>
    ),
  },
];
