import type { LocalDriver } from '@smarteverything/domain';
import type { LocalDriverDefinition } from './driver-types';
import { xiaomiScaleDriver } from './xiaomi-scale';
import { xiaomiWatchDriver } from './xiaomi-watch';

export const LOCAL_DRIVER_REGISTRY: Readonly<Record<LocalDriver, LocalDriverDefinition>> = {
  xiaomi_scale: xiaomiScaleDriver,
  xiaomi_watch: xiaomiWatchDriver,
};
