import type { AppPlugin } from '../contract';
import { homeWhenDeviceOf } from '../shared/plugin-home';
import { ClientsSection } from './clients-section';
import { InternetSection } from './internet-section';
import { RouterCardFace, RouterFace } from './overview/router-card-faces';
import { RouterHero } from './overview/router-hero';
import { RouterNotice } from './overview/router-notice';
import { RouterOverview } from './overview/router-overview';
import { RouterQuickActions } from './quick-actions';
import { ROUTER_PLUGIN } from './router-data';
import { ROUTER_WIDGETS } from './router-widgets';
import { WifiSection } from './wifi-section';

const isRouter = (device: { readonly kind: string }): boolean => device.kind === 'router';

const ROUTER_WIDGET_ALIASES = {
  'router.internet': 'router-internet',
  'router.speed': 'router-internet',
  'router.home': 'router-people',
} as const;

export const routerAppPlugin: AppPlugin = {
  id: ROUTER_PLUGIN,
  widgets: ROUTER_WIDGETS,
  home: homeWhenDeviceOf('router', ROUTER_WIDGETS),
  widgetAliases: ROUTER_WIDGET_ALIASES,
  deviceCards: [
    {
      key: 'router',
      applies: isRouter,
      render: (device, size, showRoom) => (
        <RouterFace device={device} size={size} showRoom={showRoom} />
      ),
      cell: (device, frame, size) => <RouterCardFace device={device} frame={frame} size={size} />,
      quick: (device) => <RouterQuickActions device={device} />,
      hero: (device) => <RouterHero device={device} />,
      notice: () => <RouterNotice />,
    },
  ],
  deviceOverviews: [
    {
      key: 'router',
      replacesReadings: true,
      applies: isRouter,
      render: (device) => <RouterOverview device={device} />,
    },
  ],
  deviceSettings: [],
  deviceSections: [
    {
      key: 'internet',
      order: 1,
      icon: 'globe',
      title: 'Internet',
      applies: isRouter,
      render: (device, beside) => <InternetSection device={device} beside={beside} />,
    },
    {
      key: 'clients',
      order: 2,
      icon: 'users',
      title: 'Devices on the network',
      scrolls: true,
      applies: isRouter,
      render: () => <ClientsSection />,
    },
    {
      key: 'wifi',
      order: 3,
      icon: 'wifi',
      title: 'Wi-Fi',
      applies: isRouter,
      render: () => <WifiSection />,
    },
  ],
  settings: null,
};
