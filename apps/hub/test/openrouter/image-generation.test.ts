import { IMAGE_OPERATION_REQUEST_READ } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeImage } from '../../src/assistant/image/media';
import { testStore, type TestStore } from '../support/store';
import {
  event,
  eventStream,
  fakeOpenRouter,
  hanging,
  imageRig,
  MemoryFiles,
  png,
  type FakeOpenRouter,
} from './image-fixture';

let test: TestStore;
beforeEach(async () => {
  test = await testStore();
});
afterEach(async () => {
  await test.close();
});

async function streamOf(): Promise<FakeOpenRouter> {
  const image = (await png()).toString('base64');
  const completed = (cost: number): string =>
    event('image_generation.completed', { b64_json: image, usage: { cost } });
  const text =
    event('image_generation.partial_image', { b64_json: image }) +
    event('image_generation.partial_image', { b64_json: 'bm90IGFuIGltYWdl' }) +
    [0.04, 0.04, 0.04, 0.04].map(completed).join('') +
    'data: [DONE]\n\n';
  return fakeOpenRouter(['vendor/m1'], () => Promise.resolve(eventStream(text)));
}

describe('streamed image generation', () => {
  it('saves all four images when one preview cannot be rendered', async () => {
    const rig = imageRig(test, await streamOf());
    const started = await rig.start({ n: 4, stream: true });
    const receipt = await rig.settle(started.id);
    expect(receipt.state).toBe('completed');
    expect(receipt.results).toHaveLength(4);
    expect(rig.previews).toHaveLength(1);
    expect(receipt.progress).toBe(2);
  });

  it('keeps the images already finished when the stream is cut short', async () => {
    const image = (await png()).toString('base64');
    const text =
      event('image_generation.completed', { b64_json: image }) +
      event('image_generation.completed', { b64_json: image }) +
      event('error');
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => Promise.resolve(eventStream(text))),
    );
    const receipt = await rig.settle((await rig.start({ n: 4, stream: true })).id);
    expect(receipt.state).toBe('completed');
    expect(receipt.results).toHaveLength(2);
  });

  it('records the provider cost reported with the finished image', async () => {
    const rig = imageRig(test, await streamOf());
    const receipt = await rig.settle((await rig.start({ n: 4, stream: true })).id);
    expect(receipt.usage).toEqual({ cost: 0.04 });
    expect(receipt.usage_ledger_id).not.toBeNull();
  });
});

describe('buffered image generation', () => {
  it('accepts base64 with line breaks, without padding and in the URL-safe alphabet', async () => {
    const bytes = await png();
    const wrapped = bytes.toString('base64').replace(/(.{40})/g, '$1\n');
    const unpadded = bytes.toString('base64').replace(/=+$/, '');
    const urlSafe = bytes.toString('base64url');
    for (const variant of [wrapped, unpadded, urlSafe]) {
      const decoded = await decodeImage(variant);
      expect(decoded.content.equals(bytes)).toBe(true);
      expect(decoded.mime).toBe('image/png');
    }
  });

  it('keeps the readable images when one of them is corrupt', async () => {
    const good = (await png()).toString('base64');
    const body = JSON.stringify({ data: [{ b64_json: good }, { b64_json: 'AAAA' }] });
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => Promise.resolve(new Response(body))),
    );
    const receipt = await rig.settle((await rig.start({ n: 2 })).id);
    expect(receipt.state).toBe('completed');
    expect(receipt.results).toHaveLength(1);
  });

  it('accepts a response whose usage block is malformed', async () => {
    const good = (await png()).toString('base64');
    const body = JSON.stringify({ data: [{ b64_json: good }], usage: 'free' });
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => Promise.resolve(new Response(body))),
    );
    const receipt = await rig.settle((await rig.start({})).id);
    expect(receipt.state).toBe('completed');
    expect(receipt.usage).toBeNull();
  });

  it('completes with the images that were saved when a later save fails', async () => {
    const good = (await png()).toString('base64');
    const body = JSON.stringify({
      data: [{ b64_json: good }, { b64_json: good }, { b64_json: good }],
    });
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => Promise.resolve(new Response(body))),
      new MemoryFiles(test, 2),
    );
    const receipt = await rig.settle((await rig.start({ n: 3 })).id);
    expect(receipt.state).toBe('completed');
    expect(receipt.results).toHaveLength(2);
  });
});

describe('image operation queue', () => {
  it('runs four at a time and finishes the rest as slots free up', async () => {
    const good = (await png()).toString('base64');
    const body = JSON.stringify({ data: [{ b64_json: good }] });
    const waiting: (() => void)[] = [];
    let inFlight = 0;
    let peak = 0;
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise((resolve) => {
          waiting.push(() => {
            inFlight -= 1;
            resolve(new Response(body));
          });
        });
      }),
    );
    const started = await Promise.all(Array.from({ length: 6 }, () => rig.start({})));
    await vi.waitFor(() => {
      expect(waiting).toHaveLength(4);
    });
    expect(started.map((receipt) => receipt.state)).toEqual(Array(6).fill('reserved'));
    while (waiting.length > 0) waiting.shift()?.();
    await vi.waitFor(() => {
      expect(waiting).toHaveLength(2);
    });
    while (waiting.length > 0) waiting.shift()?.();
    const settled = await Promise.all(started.map((receipt) => rig.settle(receipt.id)));
    expect(settled.map((receipt) => receipt.state)).toEqual(Array(6).fill('completed'));
    expect(peak).toBe(4);
  });

  it('cancels an operation that is still waiting for a slot', async () => {
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], (_body, signal) => hanging(signal)),
    );
    const running = await Promise.all(Array.from({ length: 4 }, () => rig.start({})));
    const queued = await rig.start({});
    const cancelled = rig.cancel(queued.id);
    expect([cancelled.state, cancelled.cancellation_requested]).toEqual(['cancelled', true]);
    expect(cancelled.reason).toMatch(/before it was sent.*Nothing was billed/u);
    expect((await rig.settle(queued.id)).state).toBe('cancelled');
    await rig.service.stop();
    const settled = await Promise.all(running.map((receipt) => rig.settle(receipt.id)));
    expect(settled.map((receipt) => receipt.state)).toEqual(Array(4).fill('unknown'));
  });
});

describe('image operation identity', () => {
  it('returns the existing receipt when the same request is sent again', async () => {
    const good = (await png()).toString('base64');
    const transport = fakeOpenRouter(['vendor/m1'], () =>
      Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: good }] }))),
    );
    const rig = imageRig(test, transport);
    const id = crypto.randomUUID();
    const first = await rig.start({}, id);
    const second = await rig.start({}, id);
    expect(second.id).toBe(first.id);
    await rig.settle(first.id);
    expect(transport.requests.filter((request) => request === 'POST /api/v1/images')).toHaveLength(
      1,
    );
  });

  it('still reads a stored request that carries the retired capability revision', () => {
    const stored = IMAGE_OPERATION_REQUEST_READ.parse({
      mode: 'generate',
      operation_id: crypto.randomUUID(),
      chat_id: crypto.randomUUID(),
      prompt: 'a lamp',
      model: 'vendor/m1',
      provider_tag: 'tag',
      capability_revision: 'a'.repeat(64),
      options: { n: 1, stream: false },
    });
    expect(stored).not.toHaveProperty('capability_revision');
  });
});
