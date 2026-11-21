import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareContent } from '../../src/drive/changes';
import { settleContent } from '../../src/drive/settle-batch';
import type { SettleInput } from '../../src/drive/units/content';
import { stageBytes } from '../../src/drive/versions';
import { openPosixRig, type PosixRig } from './posix/posix-rig';
import type { WriteUnits } from '../../src/store/host/registry';
import type { UnitInput } from '../../src/store/host/unit';

let rig: PosixRig;

beforeEach(async () => {
  rig = await openPosixRig(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rig.close();
});

async function prepared(relPath: string): Promise<SettleInput> {
  const root = rig.opened.store.driveRoots.byId(rig.mine.id);
  const staged = await stageBytes(rig.env.change, root, Readable.from([Buffer.from(relPath)]));
  const content = await prepareContent(
    rig.env.change,
    {
      root,
      staged,
      relPath,
      actor: { actorProfileId: rig.ownerId, via: 'app', deviceId: null },
    },
    new Set(),
  );
  return content.input;
}

function settleCalls(spy: { readonly mock: { readonly calls: readonly unknown[][] } }): string[] {
  return spy.mock.calls.flatMap(([name]) =>
    name === 'driveSettleBatch' || name === 'driveSettleContent' ? [name] : [],
  );
}

describe('settling content writes', () => {
  it('settles the writes of one turn in one writer call', async () => {
    const inputs = await Promise.all(['a', 'b', 'c'].map((name) => prepared(name)));
    const { host } = rig.opened.store;
    const spy = vi.spyOn(host, 'write');
    const settled = await Promise.all(inputs.map((input) => settleContent(host, input)));
    expect(settled.map((one) => one.item.relPath)).toEqual(['a', 'b', 'c']);
    expect(settleCalls(spy)).toEqual(['driveSettleBatch']);
  });

  it('holds writes that arrive during a batch for the next batch', async () => {
    const inputs = await Promise.all(['a', 'b', 'c', 'd'].map((name) => prepared(name)));
    const { host } = rig.opened.store;
    const spy = vi.spyOn(host, 'write');
    const [first, second, ...later] = inputs;
    if (first === undefined || second === undefined) throw new Error('two inputs are missing');
    const early = [settleContent(host, first), settleContent(host, second)];
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    const late = later.map((input) => settleContent(host, input));
    await Promise.all([...early, ...late]);
    expect(settleCalls(spy)).toEqual(['driveSettleBatch', 'driveSettleBatch']);
  });

  it('settles each write alone when the batch fails, so only the bad write fails', async () => {
    const inputs = await Promise.all(['a', 'b'].map((name) => prepared(name)));
    const { host } = rig.opened.store;
    const write = host.write.bind(host);
    const spy = vi
      .spyOn(host, 'write')
      .mockImplementation(<N extends keyof WriteUnits>(name: N, input: UnitInput<WriteUnits[N]>) =>
        name === 'driveSettleBatch'
          ? Promise.reject(new Error('the batch was refused'))
          : write(name, input),
      );
    const settled = await Promise.all(inputs.map((input) => settleContent(host, input)));
    expect(settled.map((one) => one.item.relPath)).toEqual(['a', 'b']);
    expect(settleCalls(spy)).toEqual([
      'driveSettleBatch',
      'driveSettleContent',
      'driveSettleContent',
    ]);
  });
});
