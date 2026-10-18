import type { ReactNode } from 'react';
import { ServiceNotice } from '../../shared/plugin-notice';
import { routerNotice, useRouterSnapshot } from '../router-data';

export function RouterNotice(): ReactNode {
  const stream = useRouterSnapshot();
  return stream.state === 'ready' ? (
    <ServiceNotice pluginId="router" notice={routerNotice(stream.value)} />
  ) : null;
}
