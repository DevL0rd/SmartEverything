import {
  CLASSIC_SERVICE,
  CONDOR_ADVERT_TEXT,
  CONDOR_SERVICE,
  SONICARE_COMPANY_ID,
  type BleContentFilter,
} from '@smarteverything/domain';
import { bytesToHex } from '@smarteverything/ble';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { SONICARE_DRIVER } from './config';

const CONDOR_DATA = new TextEncoder().encode(CONDOR_ADVERT_TEXT);

export function sonicareContentFilters(entries: readonly LocalDeviceEntry[]): BleContentFilter[] {
  if (!entries.some((entry) => entry.driver === SONICARE_DRIVER)) {
    return [];
  }
  return [
    { serviceUuid: CLASSIC_SERVICE },
    { serviceUuid: CONDOR_SERVICE },
    {
      companyId: SONICARE_COMPANY_ID,
      dataPrefix: bytesToHex(CONDOR_DATA),
      dataMask: 'ff'.repeat(CONDOR_DATA.length),
    },
  ];
}
