import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import {
  ServiceWidgetFrame,
  type ServiceReady,
  type ServiceWidget,
} from '../../shared/service-widget-frame';
import { ADGUARD_PLUGIN, useAdGuardSnapshot } from '../adguard-data';

export type BlockingReady = ServiceReady<AdGuardSnapshot>;

const ADGUARD_WIDGET: ServiceWidget<AdGuardSnapshot> = {
  pluginId: ADGUARD_PLUGIN,
  deviceKind: 'dns_filter',
  useSnapshot: useAdGuardSnapshot,
  offTitle: 'The AdGuard Home plugin is off',
  setUpTitle: 'Set up AdGuard Home',
  setUpIcon: 'shield',
  hideRemoveWhenSmall: false,
};

interface BlockingWidgetFrameProps {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly action?: (ready: BlockingReady) => ReactNode;
  readonly children: (ready: BlockingReady) => ReactNode;
}

export function BlockingWidgetFrame(props: BlockingWidgetFrameProps): ReactNode {
  return <ServiceWidgetFrame service={ADGUARD_WIDGET} {...props} />;
}
