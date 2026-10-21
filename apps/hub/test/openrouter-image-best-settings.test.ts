import { IMAGE_ENDPOINT, IMAGE_OPERATION_REQUEST } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { withBestSettings } from '../src/openrouter/image-options';

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
  options: Record<string, unknown>,
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

describe('the best settings an image endpoint offers', () => {
  it('sets the highest quality and resolution the endpoint lists over what was asked', () => {
    const found = endpoint({
      quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high'] },
      resolution: { type: 'enum', values: ['512', '1K', '1.5K', '4K', '2K'] },
    });
    const { options } = withBestSettings(found, request({ quality: 'low', resolution: '1K' }));
    expect(options).toMatchObject({ quality: 'high', resolution: '4K' });
  });

  it('leaves the aspect ratio to the caller and other options untouched', () => {
    const found = endpoint({
      quality: { type: 'enum', values: ['low', 'high'] },
      resolution: { type: 'enum', values: ['1K', '2K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
    });
    const { options } = withBestSettings(
      found,
      request({ aspect_ratio: '16:9', output_format: 'webp', seed: 7 }),
    );
    expect(options).toMatchObject({
      aspect_ratio: '16:9',
      output_format: 'webp',
      seed: 7,
      quality: 'high',
      resolution: '2K',
    });
  });

  it('turns an explicit size into an aspect ratio the endpoint lists plus the top resolution', () => {
    const found = endpoint({
      resolution: { type: 'enum', values: ['1K', '4K'] },
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9', '9:16', '3:2'] },
    });
    const { options } = withBestSettings(found, request({ size: '1536x1024' }));
    expect(options).toMatchObject({ aspect_ratio: '3:2', resolution: '4K' });
    expect(options.size).toBeUndefined();
  });

  it('does not add settings an endpoint does not list', () => {
    const { options } = withBestSettings(endpoint({}), request({ size: '1024x1024' }));
    expect(options).toMatchObject({ size: '1024x1024' });
    expect(options.quality).toBeUndefined();
    expect(options.resolution).toBeUndefined();
  });

  it('ignores quality words and tiers it cannot rank', () => {
    const found = endpoint({
      quality: { type: 'enum', values: ['fancy', 'plain'] },
      resolution: { type: 'enum', values: ['wide', 'tall'] },
    });
    const { options } = withBestSettings(found, request({ quality: 'plain' }));
    expect(options).toMatchObject({ quality: 'plain' });
    expect(options.resolution).toBeUndefined();
  });
});
