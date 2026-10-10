import type { AppPlugin } from '../contract';
import { ClientsSection } from './clients-section';
import { InternetSection } from './internet-section';
import { ROUTER_PLUGIN } from './router-data';
import { ROUTER_WIDGETS } from './router-widgets';
import { WifiSection } from './wifi-section';

const isRouter = (device: { readonly kind: string }): boolean => device.kind === 'router';

export const routerAppPlugin: AppPlugin = {
  id: ROUTER_PLUGIN,
  widgets: ROUTER_WIDGETS,
  deviceSections: [
    {
      key: 'internet',
      icon: 'globe',
      title: 'Internet',
      applies: isRouter,
      render: () => <InternetSection />,
    },
    {
      key: 'clients',
      icon: 'users',
      title: 'Devices on the network',
      applies: isRouter,
      render: () => <ClientsSection />,
    },
    { key: 'wifi', icon: 'wifi', title: 'Wi-Fi', applies: isRouter, render: () => <WifiSection /> },
  ],
  settings: null,
};
