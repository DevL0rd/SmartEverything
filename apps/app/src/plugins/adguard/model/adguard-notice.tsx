import type { ReactNode } from 'react';
import { ServiceNotice } from '../../shared/plugin-notice';
import { adguardNotice, useAdGuardSnapshot } from '../adguard-data';

export function AdGuardNotice(): ReactNode {
  const stream = useAdGuardSnapshot();
  return stream.state === 'ready' ? (
    <ServiceNotice pluginId="adguard" notice={adguardNotice(stream.value)} />
  ) : null;
}
