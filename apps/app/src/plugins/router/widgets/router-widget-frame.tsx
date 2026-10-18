import type { RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import {
  ServiceWidgetFrame,
  type ServiceReady,
  type ServiceWidget,
} from '../../shared/service-widget-frame';
import { ROUTER_PLUGIN, useRouterSnapshot } from '../router-data';

export type RouterReady = ServiceReady<RouterSnapshot>;

const ROUTER_WIDGET: ServiceWidget<RouterSnapshot> = {
  pluginId: ROUTER_PLUGIN,
  deviceKind: ROUTER_PLUGIN,
  useSnapshot: useRouterSnapshot,
  offTitle: 'The router plugin is off',
  setUpTitle: 'Set up the router',
  setUpIcon: 'router',
  hideRemoveWhenSmall: true,
};

interface RouterWidgetFrameProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly action?: (ready: RouterReady) => ReactNode;
  readonly children: (ready: RouterReady) => ReactNode;
}

export function RouterWidgetFrame(props: RouterWidgetFrameProps): ReactNode {
  return <ServiceWidgetFrame service={ROUTER_WIDGET} {...props} />;
}
