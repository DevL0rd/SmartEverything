import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeOpenRouter, imageRig } from '../openrouter/image-fixture';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;

beforeEach(async () => {
  test = await testStore();
});
afterEach(async () => {
  await test.close();
});

async function failedReceipt(
  status: number,
  body: string,
): Promise<{ state: string; reason: string }> {
  const rig = imageRig(
    test,
    fakeOpenRouter(['vendor/m1'], () => Promise.resolve(new Response(body, { status }))),
  );
  const settled = await rig.settle((await rig.start({})).id);
  return { state: settled.state, reason: settled.reason ?? '' };
}

const QUOTA = JSON.stringify({
  error: { code: 429, message: 'You exceeded your current quota, check billing.' },
});

describe('image operation failure receipts', () => {
  it('shows the provider message when generation is refused', async () => {
    const body = JSON.stringify({ error: { code: 400, message: 'Prompt blocked by policy.' } });
    const receipt = await failedReceipt(400, body);
    expect(receipt.state).toBe('failed');
    expect(receipt.reason).toContain('Prompt blocked by policy.');
  });

  it('keeps the receipt reason within its 200 character limit', async () => {
    const body = JSON.stringify({ error: { code: 400, message: 'x'.repeat(290) } });
    const receipt = await failedReceipt(400, body);
    expect(receipt.state).toBe('failed');
    expect(receipt.reason).toHaveLength(200);
  });

  it('names the status when the error body is not an OpenRouter error', async () => {
    const receipt = await failedReceipt(502, '<html>');
    expect(receipt.state).toBe('failed');
    expect(receipt.reason).toContain('HTTP 502');
  });

  it('fails with the picked model and the provider reason, without trying another model', async () => {
    const asked: string[] = [];
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1', 'vendor/m2'], (body) => {
        asked.push(String(body['model']));
        return Promise.resolve(new Response(QUOTA, { status: 429 }));
      }),
    );
    const id = crypto.randomUUID();
    const receipt = await rig.settle((await rig.start({}, id)).id);
    expect(receipt.state).toBe('failed');
    expect(receipt.endpoint.model).toBe('vendor/m1');
    expect(receipt.request.model).toBe('vendor/m1');
    expect(receipt.results).toHaveLength(0);
    expect(asked).toEqual(['vendor/m1']);
    expect(receipt.reason).toContain('no quota left');
    expect(receipt.reason).not.toContain('No image model had quota left');
  });

  it('replays the failed receipt for the same operation id', async () => {
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => Promise.resolve(new Response(QUOTA, { status: 429 }))),
    );
    const id = crypto.randomUUID();
    const first = await rig.settle((await rig.start({}, id)).id);
    const replay = await rig.start({}, id);
    expect(replay.id).toBe(first.id);
    expect(replay.state).toBe('failed');
    expect(replay.reason).toBe(first.reason);
  });
});
