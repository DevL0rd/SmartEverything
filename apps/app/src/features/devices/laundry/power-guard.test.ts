import { afterEach, describe, expect, it } from 'vitest';
import { pendingConfirm, settleConfirm } from '../../../components/confirm-store';
import { deviceModelOf } from '../model/device-model';
import { confirmPowerOff } from './power-guard';
import { washerDevice, washerValues } from './washer-fixture';

const BASE = { power: true, laundry_program: 'ECO4060', fault: 'No Faults' } as const;

function guard(status: string, online = true): Promise<boolean> {
  const device = washerDevice(online);
  return confirmPowerOff(
    deviceModelOf(device),
    washerValues({ ...BASE, laundry_status: status }, device),
    online,
  );
}

afterEach(() => {
  settleConfirm(false);
});

describe('power off guard', () => {
  it('lets an idle washer turn off without asking', async () => {
    await expect(guard('Idle')).resolves.toBe(true);
    expect(pendingConfirm.get()).toBeNull();
  });

  it.each(['Busy', 'Paused'])('asks before turning off a %s cycle', async (status) => {
    const answer = guard(status);
    expect(pendingConfirm.get()?.title).toBe('Turn off mid-cycle?');
    settleConfirm(true);
    await expect(answer).resolves.toBe(true);
  });

  it('stops when the person declines', async () => {
    const answer = guard('Busy');
    settleConfirm(false);
    await expect(answer).resolves.toBe(false);
  });
});
