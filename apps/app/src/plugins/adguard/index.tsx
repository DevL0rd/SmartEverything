import type { AppPlugin } from '../contract';
import { ADGUARD_PLUGIN } from './adguard-data';
import { ADGUARD_WIDGETS } from './adguard-widgets';
import { BlockingSection } from './blocking-section';
import { FiltersSection } from './filters-section';
import { QueriesSection } from './queries-section';

const isAdBlocker = (device: { readonly kind: string }): boolean => device.kind === 'dns_filter';

export const adguardAppPlugin: AppPlugin = {
  id: ADGUARD_PLUGIN,
  widgets: ADGUARD_WIDGETS,
  deviceSettings: [],
  deviceSections: [
    {
      key: 'blocking',
      title: 'Ad blocking',
      icon: 'shield',
      applies: isAdBlocker,
      render: () => <BlockingSection />,
    },
    {
      key: 'queries',
      title: 'Query log',
      icon: 'list',
      applies: isAdBlocker,
      render: () => <QueriesSection />,
    },
    {
      key: 'filters',
      title: 'Filter lists',
      icon: 'filter',
      applies: isAdBlocker,
      render: () => <FiltersSection />,
    },
  ],
  settings: null,
};
