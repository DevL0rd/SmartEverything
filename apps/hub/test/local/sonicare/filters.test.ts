import { CLASSIC_SERVICE, CONDOR_SERVICE, SONICARE_COMPANY_ID } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SONICARE_DRIVER } from '../../../src/local/sonicare/config';
import { sonicareContentFilters } from '../../../src/local/sonicare/filters';
import type { LocalDeviceEntry } from '../../../src/store/repositories/local-devices';

function entry(driver: LocalDeviceEntry['driver']): LocalDeviceEntry {
  return {
    externalId: `${driver}:one`,
    driver,
    address: 'AA:BB:CC:DD:EE:FF',
    name: 'Device',
    config: {},
    createdAt: '2026-10-18T07:00:00.000Z',
  };
}

describe('the filters the phone scans with for a toothbrush', () => {
  it('asks for nothing when no toothbrush is set up', () => {
    expect(sonicareContentFilters([])).toEqual([]);
    expect(sonicareContentFilters([entry('kingsmith_treadmill')])).toEqual([]);
  });

  it('asks for both Sonicare services and for the Condor name in the advert data', () => {
    const filters = sonicareContentFilters([entry(SONICARE_DRIVER)]);
    expect(filters).toEqual([
      { serviceUuid: CLASSIC_SERVICE },
      { serviceUuid: CONDOR_SERVICE },
      {
        companyId: SONICARE_COMPANY_ID,
        dataPrefix: '436f6e646f72',
        dataMask: 'ffffffffffff',
      },
    ]);
  });

  it('asks once however many toothbrushes there are', () => {
    expect(sonicareContentFilters([entry(SONICARE_DRIVER), entry(SONICARE_DRIVER)])).toHaveLength(
      3,
    );
  });
});
