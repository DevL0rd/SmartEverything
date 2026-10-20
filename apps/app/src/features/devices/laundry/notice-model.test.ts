import { UNLOAD_PENDING_CAPABILITY, presentDevice } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { noticeKindsOf, unloadOptions } from './notice-model';
import { washerDevice } from './washer-fixture';

describe('washing machine notice settings', () => {
  it('offers every notice the machine can report', () => {
    const washer = washerDevice();
    const tracked = {
      ...washer,
      capabilities: [...washer.capabilities, UNLOAD_PENDING_CAPABILITY],
    };
    expect(noticeKindsOf(presentDevice(washer))).not.toContain('unload');
    expect(noticeKindsOf(presentDevice(tracked))).toEqual([
      'finished',
      'fault',
      'detergent',
      'softener',
      'filter',
      'unload',
    ]);
  });

  it('keeps an unusual reminder time among the choices', () => {
    expect(unloadOptions(37).map((option) => option.value)).toEqual([
      '15',
      '30',
      '37',
      '45',
      '60',
      '90',
      '120',
    ]);
  });
});
