import { IMAGE_OPERATION_REQUEST, type ImageEndpoint } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { ImageOperationError } from '../../src/assistant/image/errors';
import { OpenRouterClient } from '../../src/openrouter/client';
import { OpenRouterImageCatalog } from '../../src/openrouter/image-catalog';
import { OpenRouterImageProvider } from '../../src/openrouter/image-provider';
import { testStore } from '../support/store';

const ENDPOINT: ImageEndpoint = {
  model: 'vendor/model',
  name: 'Model',
  provider_tag: 'tag',
  parameters: {},
  supports_streaming: false,
  pricing: [],
};
const REQUEST = IMAGE_OPERATION_REQUEST.parse({
  mode: 'generate',
  operation_id: '3d6f1f58-6a39-4d3b-8f0e-0c6b6e1a2b11',
  chat_id: '9f1b0f0e-5a53-4f3f-9c3a-0a8f5f1d7c22',
  prompt: 'a lamp',
  model: ENDPOINT.model,
  provider_tag: ENDPOINT.provider_tag,
});

function answering(status: number, body: string): typeof fetch {
  return () => Promise.resolve(new Response(body, { status }));
}

function detailOf(failure: unknown): string {
  if (!(failure instanceof ImageOperationError)) throw new Error('Not an image operation error.');
  return failure.detail;
}

function clientOf(transport: typeof fetch): OpenRouterClient {
  return new OpenRouterClient({ fetch: transport, key: (): string => 'key' });
}

async function generationFailure(transport: typeof fetch): Promise<unknown> {
  return new OpenRouterImageProvider(clientOf(transport))
    .generate({
      request: REQUEST,
      endpoint: ENDPOINT,
      inputs: [],
      signal: new AbortController().signal,
      submitted: (): void => undefined,
      usage: (): void => undefined,
      preview: () => Promise.resolve(),
    })
    .then(
      () => null,
      (error: unknown) => error,
    );
}

describe('OpenRouter image errors', () => {
  it('reports the provider message when generation is refused', async () => {
    const body = JSON.stringify({ error: { code: 400, message: 'Prompt blocked by policy.' } });
    const failure = await generationFailure(answering(400, body));
    expect(failure).toMatchObject({ code: 'provider' });
    expect(detailOf(failure)).toContain('Prompt blocked by policy.');
  });

  it('reports the status when the error body is not an OpenRouter error', async () => {
    for (const body of ['<html>bad gateway</html>', '{"unexpected":true}', '']) {
      const failure = await generationFailure(answering(502, body));
      expect(failure).toMatchObject({ code: 'provider' });
      expect(detailOf(failure)).toContain('HTTP 502');
    }
  });

  it('keeps the status error when the error body cannot be read', async () => {
    const broken = new ReadableStream({
      start(controller): void {
        controller.error(new TypeError('socket reset'));
      },
    });
    const failure = await generationFailure(() =>
      Promise.resolve(new Response(broken, { status: 500 })),
    );
    expect(failure).toMatchObject({ code: 'provider' });
    expect(detailOf(failure)).toContain('HTTP 500');
  });

  it('treats a connection that fails after submission as an unknown outcome', async () => {
    const failure = await generationFailure(() => Promise.reject(new TypeError('socket reset')));
    expect(failure).toMatchObject({ code: 'unknown' });
  });

  it('reports the provider message when the endpoint catalogue is refused', async () => {
    const { store, close } = await testStore();
    const body = JSON.stringify({ error: { message: 'Insufficient credits.' } });
    const catalog = new OpenRouterImageCatalog({
      client: clientOf(answering(402, body)),
      store: store.aiModels,
      now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    });
    const failure = await catalog.list(true).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: 'upstream_failed' });
    expect(failure instanceof Error && failure.message).toContain('Insufficient credits.');
    await close();
  });
});
