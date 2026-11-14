import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import { diffuserDevice } from '../diffuser/fixture';
import { deviceModelOf, powerGatesCommands } from './device-model';

describe('power as a command gate', () => {
  it('lets every diffuser command run while the diffuser is off', () => {
    expect(powerGatesCommands(deviceModelOf(diffuserDevice()))).toBe(false);
  });

  it('keeps power as the gate for other devices', () => {
    expect(powerGatesCommands(deviceModelOf(deviceFixture(1)))).toBe(true);
  });
});
