import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { closeSetups, lit, node, program, rigV3, trigger } from './support/rig-v3';
import type { RigV3 } from './support/rig-v3';

afterEach(closeSetups);

const REMOTE = randomUUID();

const MINUTE = 60_000;

function throttled(lamp: string): ReturnType<typeof program> {
  return program(
    [
      node('cool', 'timing.cooldown', { period: lit(MINUTE) }),
      node('light', 'device.set', {
        target: lit({ device: lamp }),
        control: lit('brightness'),
        to: lit(40),
      }),
    ],
    { triggers: [trigger('trigger.button', { device: lit(REMOTE), press: lit('single') })] },
  );
}

async function press(rig: RigV3, runs: number): Promise<void> {
  rig.press(REMOTE, 'single');
  await rig.until(() => rig.finished.length === runs);
}

function rows(rig: RigV3): unknown[] {
  return rig.database
    .prepare('select partition, state, wake_at from automation_node_state')
    .all()
    .map((row) => ({ ...row }));
}

describe('stateful nodes in the V3 engine', () => {
  it('lets a press through at most once per period', async () => {
    const rig = await rigV3();
    rig.add(throttled(rig.home.lampId));
    rig.engine.sync();
    await press(rig, 1);
    await press(rig, 2);
    expect(rig.home.adapter.executed).toHaveLength(1);
    await rig.advance(MINUTE + 1);
    await press(rig, 3);
    expect(rig.home.adapter.executed).toHaveLength(2);
  });

  it('keeps what a node remembers in the state table across a hub restart', async () => {
    const rig = await rigV3();
    const row = rig.add(throttled(rig.home.lampId));
    rig.engine.sync();
    await press(rig, 1);
    expect(rows(rig)).toHaveLength(1);
    expect(rows(rig)[0]).toMatchObject({ partition: 'state', wake_at: null });
    rig.restart();
    rig.engine.sync();
    await press(rig, 2);
    expect(rig.home.adapter.executed).toHaveLength(1);
    expect(rig.runs(row.id).map((run) => run.status)).toStrictEqual(['succeeded', 'succeeded']);
  });

  it('forgets what a node remembered when its automation is removed', async () => {
    const rig = await rigV3();
    const row = rig.add(throttled(rig.home.lampId));
    rig.engine.sync();
    await press(rig, 1);
    expect(rows(rig)).toHaveLength(1);
    rig.database.prepare('delete from automations where id = ?').run(row.id);
    expect(rows(rig)).toHaveLength(0);
  });
});
