import type { AppPlugin } from '../contract';
import { homeWhenDeviceOf } from '../shared/plugin-home';
import { ADGUARD_PLUGIN } from './adguard-data';
import { ADGUARD_WIDGETS } from './adguard-widgets';
import { BlockingSection } from './blocking-section';
import { FiltersSection } from './filters-section';
import { AdGuardCardFace, AdGuardFace } from './model/adguard-face';
import { AdGuardHero } from './model/adguard-hero';
import { AdGuardNotice } from './model/adguard-notice';
import { AdGuardOverview } from './model/adguard-overview';
import { QueriesSection } from './queries-section';
import { AdGuardQuickActions } from './quick-actions';

const isAdBlocker = (device: { readonly kind: string }): boolean => device.kind === 'dns_filter';

const ADGUARD_WIDGET_ALIASES = { 'adguard.blocking': 'adguard-blocking' } as const;

export const adguardAppPlugin: AppPlugin = {
  id: ADGUARD_PLUGIN,
  widgets: ADGUARD_WIDGETS,
  home: homeWhenDeviceOf('dns_filter', ADGUARD_WIDGETS),
  widgetAliases: ADGUARD_WIDGET_ALIASES,
  deviceCards: [
    {
      key: 'adguard',
      applies: isAdBlocker,
      render: (device, size, showRoom) => (
        <AdGuardFace device={device} size={size} showRoom={showRoom} />
      ),
      cell: (device, frame, size) => <AdGuardCardFace device={device} frame={frame} size={size} />,
      quick: (device) => <AdGuardQuickActions device={device} />,
      hero: () => <AdGuardHero />,
      notice: () => <AdGuardNotice />,
    },
  ],
  deviceOverviews: [
    {
      key: 'adguard',
      replacesReadings: true,
      applies: isAdBlocker,
      render: (device) => <AdGuardOverview device={device} />,
    },
  ],
  deviceSettings: [],
  deviceSections: [
    {
      key: 'blocking',
      order: 1,
      title: 'Ad blocking',
      icon: 'shield',
      applies: isAdBlocker,
      render: (device, beside) => <BlockingSection device={device} beside={beside} />,
    },
    {
      key: 'queries',
      order: 2,
      title: 'Query log',
      icon: 'list',
      scrolls: true,
      applies: isAdBlocker,
      render: () => <QueriesSection />,
    },
    {
      key: 'filters',
      order: 3,
      title: 'Filter lists',
      icon: 'filter',
      applies: isAdBlocker,
      render: () => <FiltersSection />,
    },
  ],
  settings: null,
};
