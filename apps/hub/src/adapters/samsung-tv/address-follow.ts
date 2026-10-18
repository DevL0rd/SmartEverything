import { MAC_ADDRESS } from '@smarteverything/domain';
import type { TvInfo } from '@smarteverything/smartthings';

export function sameTelevision(info: TvInfo, macAddress: string): boolean {
  const mac = info.wifiMac === null ? null : MAC_ADDRESS.safeParse(info.wifiMac);
  return mac?.success === true && mac.data.toLowerCase() === macAddress.toLowerCase();
}
