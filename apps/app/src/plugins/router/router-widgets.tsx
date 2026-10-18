import type { WidgetDefinition } from '../../components/widget-board';
import { INTERNET_WIDGET_SIZES, PEOPLE_WIDGET_SIZES } from './widgets/frame-faces';
import { InternetWidget } from './widgets/internet-widget';
import { PeopleWidget } from './widgets/people-widget';

export const ROUTER_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'router-internet',
    title: 'Internet',
    icon: 'router',
    group: 'Network',
    sizes: INTERNET_WIDGET_SIZES,
    defaultSize: 'M',
    render: () => <InternetWidget />,
  },
  {
    type: 'router-people',
    title: 'Who’s home',
    icon: 'users',
    group: 'Network',
    sizes: PEOPLE_WIDGET_SIZES,
    defaultSize: 'M',
    render: () => <PeopleWidget />,
  },
];
