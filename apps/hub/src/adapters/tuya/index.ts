import { DISCOVERY_PORTS } from '@smarteverything/tuya';
import type { ProviderModule } from '../contract';
import { nodeDependencies } from './dependencies';
import { createTuyaModule } from './module';

export const tuyaModule: ProviderModule<'tuya'> = createTuyaModule(
  nodeDependencies(DISCOVERY_PORTS),
);
