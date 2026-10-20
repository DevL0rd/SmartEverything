import type { ReactNode } from 'react';
import type { DeviceProps } from '../../toothbrush/brand-ui';
import { OralbBatteryExtras } from './battery-extras';
import { OralbHandleCard } from './handle-card';

export function OralbCareCards({ deviceId, view }: DeviceProps): ReactNode {
  return (
    <>
      <OralbBatteryExtras deviceId={deviceId} view={view} />
      <OralbHandleCard deviceId={deviceId} view={view} />
    </>
  );
}
