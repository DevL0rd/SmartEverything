import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testStore, type TestStore } from '../support/store';
import { fakeOpenRouter, hanging, imageRig, png } from './image-fixture';

let test: TestStore;
beforeEach(async () => {
  test = await testStore();
});
afterEach(async () => {
  await test.close();
});

describe('waiting for an image outcome', () => {
  it('returns the finished receipt with the saved images only once the provider answered', async () => {
    const good = (await png()).toString('base64');
    let answer: () => void = () => undefined;
    const rig = imageRig(
      test,
      fakeOpenRouter(
        ['vendor/m1'],
        () =>
          new Promise((resolve) => {
            answer = (): void => {
              resolve(new Response(JSON.stringify({ data: [{ b64_json: good }] })));
            };
          }),
      ),
    );
    const started = await rig.start({});
    let state = 'waiting';
    const outcome = rig.outcome(started.id).then((receipt) => {
      state = receipt.state;
      return receipt;
    });
    await Promise.resolve();
    expect(state).toBe('waiting');
    await expect.poll(() => rig.service.availability().active).toBe(1);
    answer();
    const receipt = await outcome;
    expect(receipt.state).toBe('completed');
    expect(receipt.results).toHaveLength(1);
    expect(receipt.results[0]?.attachment.id).toEqual(expect.any(String));
  });

  it('returns the final receipt of an operation that already finished', async () => {
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => Promise.resolve(new Response('{}', { status: 400 }))),
    );
    const started = await rig.start({});
    await rig.settle(started.id);
    const receipt = await rig.outcome(started.id);
    expect(receipt.state).toBe('failed');
    expect(receipt.reason).toEqual(expect.any(String));
  });

  it('stops waiting when the caller goes away and leaves the operation running', async () => {
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], (_body, signal) => hanging(signal)),
    );
    const started = await rig.start({});
    const caller = new AbortController();
    const outcome = rig.outcome(started.id, caller.signal);
    caller.abort();
    await expect(outcome).rejects.toMatchObject({ code: 'conflict' });
    await expect(outcome).rejects.toThrow(/Do not start it again/u);
    expect(rig.service.availability().active).toBe(1);
    await rig.service.stop();
    expect((await rig.settle(started.id)).state).toBe('unknown');
  });

  it('refuses at once when the caller is already gone', async () => {
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], (_body, signal) => hanging(signal)),
    );
    const started = await rig.start({});
    await expect(rig.outcome(started.id, AbortSignal.abort())).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(rig.service.availability().active).toBe(1);
    await rig.service.stop();
  });
});
