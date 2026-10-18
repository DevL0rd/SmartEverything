import { describe, expect, it } from 'vitest';
import { nodeSystemdUnit } from '../../src/service/definitions.js';
import {
  ORIGINAL_SUFFIX,
  restoreOriginalUnit,
  writeManagedUnit,
} from '../../src/service/unit-adoption.js';
import { LAUNCH, fakeSystem } from '../support/fake-system.js';

const UNIT = '/home/ann/.config/systemd/user/smarteverything-node.service';
const DATA = '/home/ann/.config/SmartEverything-node';
const ORIGINAL = `${UNIT}${ORIGINAL_SUFFIX}`;

const NEW = nodeSystemdUnit(LAUNCH);
const HAND_WRITTEN = NEW.replace('PATH=/usr/local/bin:/usr/bin', 'PATH=/usr/bin:/bin');

function target(system: ReturnType<typeof fakeSystem>): Parameters<typeof writeManagedUnit>[0] {
  return { files: system.files, unitFile: UNIT, dataDirectory: DATA };
}

describe('taking over a unit someone wrote by hand', () => {
  it('keeps the original beside the unit and writes the managed one', async () => {
    const system = fakeSystem();
    system.touch(UNIT, HAND_WRITTEN);
    await writeManagedUnit(target(system), NEW);
    expect(system.stored.get(ORIGINAL)).toBe(HAND_WRITTEN);
    expect(system.stored.get(UNIT)).toBe(NEW);
    expect(system.modes.get(UNIT)).toBe(0o644);
  });

  it('does the same thing the second time and keeps the first original', async () => {
    const system = fakeSystem();
    system.touch(UNIT, HAND_WRITTEN);
    await writeManagedUnit(target(system), NEW);
    const snapshot = new Map(system.stored);
    await writeManagedUnit(target(system), NEW);
    expect(system.stored).toEqual(snapshot);
  });

  it('does not mistake its own older unit for the original when it writes a newer one', async () => {
    const system = fakeSystem();
    system.touch(UNIT, HAND_WRITTEN);
    await writeManagedUnit(target(system), NEW);
    const newer = NEW.replace('Restart=on-failure', 'Restart=always');
    await writeManagedUnit(target(system), newer);
    expect(system.stored.get(UNIT)).toBe(newer);
    expect(system.stored.get(ORIGINAL)).toBe(HAND_WRITTEN);
  });

  it('keeps nothing when there was nothing to keep', async () => {
    const system = fakeSystem();
    await writeManagedUnit(target(system), NEW);
    expect(system.stored.has(ORIGINAL)).toBe(false);
    system.touch(UNIT, NEW);
    system.stored.delete(`${DATA}/service-unit.sha256`);
    await writeManagedUnit(target(system), NEW);
    expect(system.stored.has(ORIGINAL)).toBe(false);
  });

  it('puts the original back exactly and forgets the takeover', async () => {
    const system = fakeSystem();
    system.touch(UNIT, HAND_WRITTEN);
    await writeManagedUnit(target(system), NEW);
    expect(await restoreOriginalUnit(target(system))).toBe(true);
    expect(system.stored.get(UNIT)).toBe(HAND_WRITTEN);
    expect(system.stored.has(ORIGINAL)).toBe(false);
    expect(system.stored.has(`${DATA}/service-unit.sha256`)).toBe(false);
    expect(await restoreOriginalUnit(target(system))).toBe(false);
    await writeManagedUnit(target(system), NEW);
    expect(system.stored.get(ORIGINAL)).toBe(HAND_WRITTEN);
  });

  it('has nothing to restore for a unit it wrote itself', async () => {
    const system = fakeSystem();
    await writeManagedUnit(target(system), NEW);
    expect(await restoreOriginalUnit(target(system))).toBe(false);
    expect(system.stored.get(UNIT)).toBe(NEW);
  });
});
