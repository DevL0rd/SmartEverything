import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';

const HASH = 'f'.repeat(64);

function clientOf(response: Response): { readonly client: ApiClient; readonly urls: string[] } {
  const urls: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input): Promise<Response> => {
    urls.push(input instanceof Request ? input.url : input.toString());
    return Promise.resolve(response);
  });
  const client = new ApiClient({
    baseUrl: 'http://hub.test',
    token: 'secret',
    fetch,
    onUnauthorized: (): void => undefined,
  });
  return { client, urls };
}

describe('reading a file from the hub as bytes', () => {
  it('returns the exact bytes of a binary answer', async () => {
    const bytes = new Uint8Array([0, 255, 128, 7]);
    const { client, urls } = clientOf(new Response(bytes, { status: 200 }));
    const read = await client.callBytes(E.readModelAsset, { params: { sha256: HASH } });
    expect([...read]).toStrictEqual([0, 255, 128, 7]);
    expect(urls).toStrictEqual([`http://hub.test/api/model-assets/${HASH}`]);
  });

  it('returns a JSON file as its bytes instead of parsing it', async () => {
    const text = '{"schema":1}';
    const { client } = clientOf(
      new Response(text, { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const read = await client.callBytes(E.readModelAsset, { params: { sha256: HASH } });
    expect(new TextDecoder().decode(read)).toBe(text);
  });

  it('raises the hub refusal for a missing file', async () => {
    const { client } = clientOf(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'gone' } }), {
        status: 404,
      }),
    );
    await expect(
      client.callBytes(E.readModelAsset, { params: { sha256: HASH } }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
