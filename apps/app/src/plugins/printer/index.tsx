import type { AppPlugin } from '../contract';
import { PrinterCardFace, PrinterTile } from './components/printer-card';
import { isPrinter } from './data/printer-device';
import { PrinterHero } from './hero';
import { SETTING_ROWS } from './model/search-rows';
import { PrinterOverview } from './overview';
import { PRINTER_PAGE, printerSearch } from './search';
import { DetailsSection } from './sections/details-section';
import { HistorySection } from './sections/history-section';
import { PaperSection } from './sections/paper-section';
import { PrintSection } from './sections/print-section';
import { StatsSection } from './sections/stats-section';
import { SuppliesSection } from './sections/supplies-section';
import { PrinterSettingsPage } from './settings/printer-settings-page';
import { PRINTER_WIDGETS } from './widgets';

export const PRINTER_PLUGIN = 'printer';

export const printerAppPlugin: AppPlugin = {
  id: PRINTER_PLUGIN,
  widgets: PRINTER_WIDGETS,
  home: (devices) => (devices.some(isPrinter) ? PRINTER_WIDGETS.map((widget) => widget.type) : []),
  deviceCards: [
    {
      key: 'printer',
      applies: isPrinter,
      render: (device, size, showRoom) => (
        <PrinterTile device={device} showRoom={showRoom} compact={size === 'tile'} />
      ),
      cell: (device, frame, size) => <PrinterCardFace device={device} frame={frame} size={size} />,
      hero: (device) => <PrinterHero device={device} />,
    },
  ],
  deviceOverviews: [
    {
      key: 'printer',
      replacesReadings: true,
      applies: isPrinter,
      render: (device) => <PrinterOverview device={device} />,
    },
  ],
  deviceSections: [
    {
      key: 'stats',
      order: 1,
      icon: 'trendUp',
      title: 'Stats',
      applies: isPrinter,
      render: (device) => <StatsSection device={device} />,
    },
    {
      key: 'supplies',
      order: 2,
      icon: 'droplet',
      title: 'Supplies',
      applies: isPrinter,
      render: (device) => <SuppliesSection device={device} />,
    },
    {
      key: 'paper',
      order: 3,
      icon: 'box',
      title: 'Paper',
      applies: isPrinter,
      render: (device) => <PaperSection device={device} />,
    },
    {
      key: 'print',
      order: 4,
      icon: 'upload',
      title: 'Print',
      applies: isPrinter,
      render: (device) => <PrintSection device={device} />,
    },
    {
      key: 'jobs',
      order: 5,
      icon: 'fileText',
      title: 'Jobs',
      applies: isPrinter,
      render: (device) => <HistorySection device={device} />,
    },
    {
      key: 'details',
      order: 6,
      icon: 'info',
      title: 'Details',
      applies: isPrinter,
      render: (device) => <DetailsSection device={device} />,
    },
  ],
  deviceSettings: [],
  devicePages: {
    pages: [
      {
        id: PRINTER_PAGE,
        title: 'Printer',
        subtitle: 'Connection, updates, supplies, goals and notifications',
        icon: 'printer',
        keywords: ['printer', 'print', 'ink', 'toner', 'ipp', 'paper'],
        settings: SETTING_ROWS.map((row) => row.title),
        applies: isPrinter,
        render: (device) => <PrinterSettingsPage device={device} />,
      },
    ],
    search: printerSearch,
  },
  settings: null,
};
