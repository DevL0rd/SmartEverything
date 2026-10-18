import { createServer } from 'node:http';
import { Agent, type Dispatcher } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { streamHubFetch } from '../../src/client-network/stream-fetch';
import { hubCall } from '../../src/client-network/transport';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function silentGapServer(gapMs: number): Promise<URL> {
  const server = createServer((_request, response) => {
    response.writeHead(200);
    response.write('a');
    setTimeout(() => {
      response.end('b');
    }, gapMs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return new URL(`http://127.0.0.1:${String(address.port)}/`);
}

describe('stream idle limit', () => {
  it('sets no body timeout unless the caller asks for one', async () => {
    const url = await silentGapServer(0);
    const seen: (number | null | undefined)[] = [];
    class Spy extends Agent {
      override dispatch(
        options: Dispatcher.DispatchOptions,
        handler: Dispatcher.DispatchHandler,
      ): boolean {
        seen.push(options.bodyTimeout);
        return super.dispatch(options, handler);
      }
    }
    const dispatcher = new Spy();
    closers.push(() => dispatcher.destroy());
    await (await hubCall({ url, dispatcher }, { method: 'GET', headers: {} })).body.text();
    await (
      await hubCall({ url, dispatcher }, { method: 'GET', headers: {}, idleTimeoutMs: 400 })
    ).body.text();
    expect(seen).toEqual([0, 400]);
  });

  it('lets a streamed answer stay silent for as long as it likes', async () => {
    const url = await silentGapServer(2500);
    const response = await streamHubFetch(new Request(url), {
      url,
      signal: new AbortController().signal,
    });
    expect(await response.text()).toBe('ab');
  });

  it('ends a body that is silent past an explicit idle limit', async () => {
    const url = await silentGapServer(2500);
    const upstream = await hubCall({ url }, { method: 'GET', headers: {}, idleTimeoutMs: 400 });
    await expect(upstream.body.text()).rejects.toThrow(/Body Timeout/);
  });
});
