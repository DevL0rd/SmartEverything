import { ORALB_COMPANY_ID, type BleContentFilter } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { ORALB_DRIVER } from './config';

const STATE_MASK = '000000ff';

const WATCHED_STATES = ['00000003', '00000009', '0000000a'] as const;

export function oralbContentFilters(entries: readonly LocalDeviceEntry[]): BleContentFilter[] {
  if (!entries.some((entry) => entry.driver === ORALB_DRIVER)) {
    return [];
  }
  return WATCHED_STATES.map((prefix) => ({
    companyId: ORALB_COMPANY_ID,
    dataPrefix: prefix,
    dataMask: STATE_MASK,
  }));
}
