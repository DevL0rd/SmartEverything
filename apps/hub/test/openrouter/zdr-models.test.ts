import { describe, expect, it } from 'vitest';
import { OpenRouterClient } from '../../src/openrouter/client';

function client(answer: unknown, requests: string[]): OpenRouterClient {
  return new OpenRouterClient({
    fetch: (input: string | URL | Request): Promise<Response> => {
      requests.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(new Response(JSON.stringify(answer)));
    },
    key: (): null => null,
  });
}

describe('the zero data retention list', () => {
  it('reads the model of every endpoint without a key, once per model', async () => {
    const requests: string[] = [];
    const ids = await client(
      {
        data: [
          { model_id: 'google/a', provider_name: 'x' },
          { model_id: 'google/a', provider_name: 'y' },
          { model_id: 'qwen/b' },
        ],
      },
      requests,
    ).zdrModelIds();
    expect([...ids].sort()).toEqual(['google/a', 'qwen/b']);
    expect(requests).toEqual(['https://openrouter.ai/api/v1/endpoints/zdr']);
  });

  it('refuses an answer that names no model', async () => {
    await expect(client({ data: [{ name: 'x' }] }, []).zdrModelIds()).rejects.toThrow();
  });
});
