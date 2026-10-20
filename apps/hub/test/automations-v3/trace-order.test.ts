import { afterEach, describe, expect, it } from 'vitest';
import { closeSetups, lit, node, program, rigV3 } from './support/rig-v3';

afterEach(closeSetups);

const MISSING_LAMP = '00000000-0000-4000-8000-00000000dead';

function repeating(
  key: string,
  times: number,
  body: ReturnType<typeof node>,
): ReturnType<typeof node> {
  return node(key, 'flow.repeat', { times: lit(times) }, { scopes: { body: { nodes: [body] } } });
}

describe('the stored node records of a run', () => {
  it('list nested loops once each, after the node that failed inside them', async () => {
    const rig = await rigV3();
    const failing = node('missing', 'device.set', {
      target: lit({ device: MISSING_LAMP }),
      control: lit('brightness'),
      to: lit(5),
    });
    const inner = repeating('inner', 3, failing);
    const outer = repeating('outer', 5, inner);
    const row = rig.add(program([outer]));
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    const run = rig.runs(row.id)[0];
    const records = rig.nodes.forRun(run?.id ?? '');
    expect(records.map((record) => record.status)).toStrictEqual(['failed', 'failed', 'failed']);
    expect(records.map((record) => record.node_id)).toStrictEqual([failing.id, inner.id, outer.id]);
  });

  it('list a loop that succeeds once, after its last pass', async () => {
    const rig = await rigV3();
    const setting = node('lamp', 'device.set', {
      target: lit({ device: rig.home.lampId }),
      control: lit('brightness'),
      to: lit(5),
    });
    const pass = repeating('passes', 3, setting);
    const row = rig.add(program([pass]));
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    const records = rig.nodes.forRun(rig.runs(row.id)[0]?.id ?? '');
    expect(records.at(-1)).toMatchObject({ node_id: pass.id, status: 'succeeded' });
    expect(records.filter((record) => record.node_id === pass.id)).toHaveLength(1);
  });
});
