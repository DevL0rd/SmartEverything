import { createElement } from 'react';
import type { SettingDefinition } from '../../settings/types';
import { LayoutSizesBlock } from './layouts/layout-sizes-block';

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'home.layouts',
    page: 'home/layouts',
    title: 'Layouts by screen size',
    keywords: [
      'layout',
      'layouts',
      'screen size',
      'fold',
      'folded',
      'unfold',
      'foldable',
      'tablet',
      'widgets',
      'copy layout',
      'reset layout',
      'follow',
    ],
    scope: 'server',
    control: 'custom',
    render: () => createElement(LayoutSizesBlock),
  },
];
