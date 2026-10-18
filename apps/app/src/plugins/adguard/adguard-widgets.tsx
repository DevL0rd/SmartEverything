import type { ReactNode } from 'react';
import type { WidgetDefinition } from '../../components/widget-board';
import { AdBlockingWidget } from './widgets/blocking-widget';
import { BLOCKING_WIDGET_SIZES } from './widgets/frame-faces';

export const ADGUARD_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'adguard-blocking',
    title: 'Ad blocking',
    icon: 'shield',
    group: 'Network',
    sizes: BLOCKING_WIDGET_SIZES,
    defaultSize: 'M',
    render: (): ReactNode => <AdBlockingWidget />,
  },
];
