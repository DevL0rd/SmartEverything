import { xiaomiMagnetDriver } from './xiaomi-magnet';
import type { LocalDriver } from '@smarteverything/domain';
import type { LocalDriverDefinition } from './driver-types';
import { xiaomiScaleDriver } from './xiaomi-scale';
import { xiaomiWatchDriver } from './xiaomi-watch';
import { kingsmithTreadmillDriver } from './treadmill/driver';
import { larqBottleDriver } from './bottle/driver';
import { sonicareDriver } from './sonicare/driver';
import { oralbDriver } from './oralb/driver';

export const LOCAL_DRIVER_REGISTRY: Readonly<Record<LocalDriver, LocalDriverDefinition>> = {
  xiaomi_magnet: xiaomiMagnetDriver,
  xiaomi_scale: xiaomiScaleDriver,
  xiaomi_watch: xiaomiWatchDriver,
  kingsmith_treadmill: kingsmithTreadmillDriver,
  larq_bottle: larqBottleDriver,
  philips_sonicare: sonicareDriver,
  oralb_io: oralbDriver,
};
