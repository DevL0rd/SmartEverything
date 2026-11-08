import { afterEach, describe, expect, it } from 'vitest';
import { STARTER_NODE_IDS } from '@smarteverything/domain';
import { rehearsals } from '../../src/automations/rehearsals';
import { closeSetups, lit, node, program, rigV3 } from './support/rig-v3';
import type { RigV3 } from './support/rig-v3';

afterEach(closeSetups);

function switchLamp(rig: RigV3, on: boolean): ReturnType<RigV3['add']> {
  return rig.add(
    program([
      node('switch', 'fn.call', {
        fn: lit(STARTER_NODE_IDS.switchDevices),
        devices: lit({ device: rig.home.lampId }),
        on: lit(on),
      }),
    ]),
  );
}

describe('the installed starter Custom Nodes on the hub', () => {
  it('runs Switch devices from the installed revision like any Custom Node', async () => {
    const rig = await rigV3();
    expect(rig.functions.byId(STARTER_NODE_IDS.switchDevices).name).toBe('Switch devices');
    const row = switchLamp(rig, true);
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id).map((record) => record.error)).toStrictEqual([null]);
    expect(rig.home.adapter.executed.map((command) => command.value)).toStrictEqual([true]);
  });

  it('rehearses a call to it without touching the device', async () => {
    const rig = await rigV3();
    const row = switchLamp(rig, false);
    rig.engine.sync();
    const rehearsal = await rehearsals({
      clock: rig.clock,
      base: rig.world(),
      watch: () => (): void => undefined,
      subjectOf: (automationId) => rig.engine.subjectOf(automationId),
      zone: () => 'UTC',
    }).run({
      automationId: row.id,
      mode: 'dry',
      inputs: {},
      scenario: undefined,
      overrides: undefined,
      breakpoints: [],
      trigger: undefined,
      startedBy: 'test',
    });
    expect(rehearsal).toMatchObject({ outcome: 'succeeded', error: null });
    expect(rehearsal.commands.map((command) => command.params['to'])).toStrictEqual([false]);
    expect(rig.home.adapter.executed).toStrictEqual([]);
  });
});
