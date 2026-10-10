import type { ModuleRegistry } from '../providers/registry-types';
import type { ProviderModule } from './contract';
import { samsungTvModule } from './samsung-tv';
import { tuyaModule } from './tuya';
import { createXiaomiModule, nodeDependencies, type CameraMotor } from './xiaomi';

export function createRegistry(
  smartthings: ProviderModule<'smartthings'>,
  motor: CameraMotor,
): ModuleRegistry {
  return {
    xiaomi: createXiaomiModule(nodeDependencies(), motor),
    tuya: tuyaModule,
    samsung_tv: samsungTvModule,
    smartthings,
  };
}
