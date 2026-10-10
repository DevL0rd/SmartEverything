import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { CurrencyRow, RatesRow, RefreshRatesRow, RegionRow } from './components/region-rows';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'region.region',
    page: 'region',
    title: 'Region',
    description: 'Where amounts of money are shown for. Automatic follows this device.',
    keywords: [
      'region',
      'country',
      'currency',
      'money',
      'locale',
      'dollars',
      'euro',
      'pounds',
      'yen',
      'price',
      'cost format',
    ],
    scope: 'client',
    control: 'custom',
    row: true,
    render: () => createElement(RegionRow),
  },
  {
    id: 'region.currency',
    page: 'region',
    title: 'Amounts shown in',
    keywords: ['currency', 'usd', 'eur', 'gbp', 'jpy', 'converted', 'conversion', 'costs'],
    scope: 'client',
    control: 'custom',
    row: true,
    render: () => createElement(CurrencyRow),
  },
  {
    id: 'region.rates',
    page: 'region',
    title: 'Exchange rates',
    keywords: ['exchange rate', 'rates', 'ecb', 'frankfurter', 'refresh rates', 'conversion'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(RatesRow),
  },
  {
    id: 'region.refresh',
    page: 'region',
    title: 'Refresh exchange rates',
    keywords: ['refresh', 'update rates', 'fetch rates', 'exchange rate', 'currency'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(RefreshRatesRow),
  },
];
