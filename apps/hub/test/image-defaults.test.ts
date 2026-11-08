import { IMAGE_ENDPOINT, IMAGE_OPERATION_REQUEST } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withDefaults } from '../src/openrouter/image-defaults';
import { admitOptions } from '../src/openrouter/image-options';
import { MemoryFiles, fakeOpenRouter, imageRig, png } from './openrouter/image-fixture';
import { testStore, type TestStore } from './support/store';

function endpoint(parameters: Record<string, unknown>): ReturnType<typeof IMAGE_ENDPOINT.parse> {
  return IMAGE_ENDPOINT.parse({
    model: 'vendor/model',
    name: 'Model',
    provider_tag: 'vendor',
    parameters,
    supports_streaming: false,
    pricing: [],
  });
}

function request(
  options: Record<string, unknown> = {},
): ReturnType<typeof IMAGE_OPERATION_REQUEST.parse> {
  return IMAGE_OPERATION_REQUEST.parse({
    operation_id: crypto.randomUUID(),
    chat_id: crypto.randomUUID(),
    mode: 'generate',
    prompt: 'a lighthouse',
    model: 'vendor/model',
    provider_tag: 'vendor',
    options,
  });
}

const COUNTED = endpoint({ n: { type: 'range', min: 1, max: 4 } });

const RANKED = endpoint({
  quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
  resolution: { type: 'enum', values: ['512', '1K', '1.5K', '4K', '2K'] },
});

describe('image options with saved defaults', () => {
  it('uses the platform defaults when nothing is saved', () => {
    const { options, provider_tag } = withDefaults(RANKED, request(), {});
    expect(options).toMatchObject({ quality: 'high', resolution: '1K', n: 1 });
    expect(provider_tag).toBe('vendor');
  });

  it('applies a saved value over the platform default', () => {
    const saved = { 'vendor/model|vendor': { quality: 'low', resolution: '2K' } };
    expect(withDefaults(RANKED, request(), saved).options).toMatchObject({
      quality: 'low',
      resolution: '2K',
    });
  });

  it('drops a saved key the model does not offer instead of failing', () => {
    const saved = { 'vendor/model|vendor': { aspect_ratio: '16:9' } };
    const { options } = withDefaults(RANKED, request(), saved);
    expect(options.aspect_ratio).toBeUndefined();
    expect(options).toMatchObject({ quality: 'high', resolution: '1K' });
  });

  it('applies a saved n when the caller sent none', () => {
    const saved = { 'vendor/model|vendor': { n: 3 } };
    expect(withDefaults(COUNTED, request(), saved).options.n).toBe(3);
  });

  it('lets an explicit n win over a saved n', () => {
    const saved = { 'vendor/model|vendor': { n: 3 } };
    expect(withDefaults(COUNTED, request({ n: 2 }), saved).options.n).toBe(2);
  });

  it('lets an explicit value win over a saved one', () => {
    const saved = { 'vendor/model|vendor': { quality: 'low', aspect_ratio: '1:1' } };
    const { options } = withDefaults(
      endpoint({
        ...RANKED.parameters,
        aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
      }),
      request({ quality: 'medium', aspect_ratio: '16:9' }),
      saved,
    );
    expect(options).toMatchObject({ quality: 'medium', aspect_ratio: '16:9' });
  });

  it('still refuses an explicit value the endpoint does not offer', () => {
    const found = endpoint({ n: { type: 'range', min: 1, max: 4 } });
    const built = withDefaults(found, request({ aspect_ratio: '16:9' }), {});
    expect(() => {
      admitOptions(found, built, 0);
    }).toThrow(/does not support aspect_ratio/u);
  });

  it('forces png, else webp, for a transparent background', () => {
    const withPng = endpoint({
      background: { type: 'enum', values: ['transparent', 'opaque'] },
      output_format: { type: 'enum', values: ['jpeg', 'png'] },
    });
    expect(withDefaults(withPng, request({ background: 'transparent' }), {}).options).toMatchObject(
      {
        output_format: 'png',
      },
    );
    const withWebp = endpoint({
      background: { type: 'enum', values: ['transparent', 'opaque'] },
      output_format: { type: 'enum', values: ['jpeg', 'webp'] },
    });
    expect(
      withDefaults(withWebp, request({ background: 'transparent' }), {}).options,
    ).toMatchObject({ output_format: 'webp' });
  });

  it('keeps an output format the caller chose for a transparent background', () => {
    const withPng = endpoint({
      background: { type: 'enum', values: ['transparent', 'opaque'] },
      output_format: { type: 'enum', values: ['png', 'webp'] },
    });
    const saved = { 'vendor/model|vendor': { background: 'transparent' } };
    expect(withDefaults(withPng, request({ output_format: 'webp' }), saved).options).toMatchObject({
      background: 'transparent',
      output_format: 'webp',
    });
  });
});

describe('image defaults through the service', () => {
  let test: TestStore;
  beforeEach(async () => {
    test = await testStore();
  });
  afterEach(async () => {
    await test.close();
  });

  it('refuses an explicit unsupported option as invalid_request', async () => {
    const good = (await png()).toString('base64');
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], () =>
        Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: good }] }))),
      ),
    );
    await expect(rig.start({ aspect_ratio: '16:9', n: 1, stream: false })).rejects.toThrow(
      /does not support aspect_ratio/u,
    );
  });

  it('makes the request with the picked model’s own saved entry', async () => {
    const asked: { readonly model: string; readonly n: unknown }[] = [];
    const good = (await png()).toString('base64');
    const rig = imageRig(
      test,
      fakeOpenRouter(['vendor/m1'], (body) => {
        asked.push({ model: String(body['model']), n: body['n'] });
        return Promise.resolve(
          new Response(JSON.stringify({ data: [{ b64_json: good }], usage: { cost: 0.02 } })),
        );
      }),
      new MemoryFiles(test),
      { 'vendor/m1|tag': { n: 2 }, 'vendor/m2|tag': { n: 4 } },
    );
    const receipt = await rig.settle((await rig.start({})).id);
    expect(receipt.state).toBe('completed');
    expect(receipt.endpoint.model).toBe('vendor/m1');
    expect(asked).toEqual([{ model: 'vendor/m1', n: 2 }]);
    expect(receipt.request.options.n).toBe(2);
  });
});
