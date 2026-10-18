import { describe, expect, it } from 'vitest';
import { deviceModelOf } from '../model/device-model';
import { readDiffuser } from './diffuser-read';
import { diffuserDevice, diffuserValues } from './fixture';

const MEDIUM = { power: true, 'raw:2.3': 4, 'raw:2.4': 15, battery: 35, 'raw:3.1': true };

describe('reading a scent diffuser', () => {
  it('names the strength from the interval and duration it reports', () => {
    const read = readDiffuser(deviceModelOf(diffuserDevice()), diffuserValues(MEDIUM));
    expect(read).toEqual({
      power: 'on',
      fault: false,
      rhythm: { intervalMinutes: 15, durationSeconds: 4 },
      strength: 'medium',
      battery: 35,
      charging: false,
      light: true,
    });
  });

  it('calls a mixed rhythm custom', () => {
    const read = readDiffuser(
      deviceModelOf(diffuserDevice()),
      diffuserValues({ ...MEDIUM, 'raw:2.4': 10 }),
    );
    expect(read.strength).toBe('custom');
  });

  it('has no rhythm until both numbers have been reported', () => {
    const read = readDiffuser(deviceModelOf(diffuserDevice()), diffuserValues({ 'raw:2.4': 15 }));
    expect(read.rhythm).toBeNull();
    expect(read.strength).toBeNull();
  });

  it('shows a fault and charging as they are reported', () => {
    const read = readDiffuser(
      deviceModelOf(diffuserDevice()),
      diffuserValues({ ...MEDIUM, 'raw:2.1': true, 'raw:5.2': 'Charging' }),
    );
    expect(read.fault).toBe(true);
    expect(read.charging).toBe(true);
  });

  it('reads an offline diffuser as offline whatever it last reported', () => {
    const read = readDiffuser(deviceModelOf(diffuserDevice(false)), diffuserValues(MEDIUM));
    expect(read.power).toBe('offline');
  });
});
