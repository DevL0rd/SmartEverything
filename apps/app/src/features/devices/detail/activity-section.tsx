import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { ActivityList } from '../../activity';

export function ActivitySection({ device }: { readonly device: Device }): ReactNode {
  return <ActivityList deviceId={device.id} />;
}
