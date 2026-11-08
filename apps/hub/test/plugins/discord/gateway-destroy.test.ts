import { once } from 'node:events';
import { Socket, createServer, type Server } from 'node:net';
import { REST } from '@discordjs/rest';
import { WebSocketManager } from '@discordjs/ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

const servers: Server[] = [];

afterEach(() => {
  servers.splice(0).forEach((server) => server.close());
});

async function gatewayThatNeverAnswers(): Promise<{
  readonly url: string;
  readonly reached: Promise<Socket>;
}> {
  const server = createServer();
  servers.push(server);
  const reached = once(server, 'connection').then(([socket]: unknown[]) => {
    if (!(socket instanceof Socket)) throw new Error('the gateway was not reached');
    return socket;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { url: `ws://127.0.0.1:${String(port)}`, reached };
}

describe('stopping the Discord gateway while it is still connecting', () => {
  it('survives the gateway dropping the half-open connection afterwards', async () => {
    const { url, reached } = await gatewayThatNeverAnswers();
    const rest = new REST();
    vi.spyOn(rest, 'get').mockResolvedValue({
      url,
      shards: 1,
      session_start_limit: { total: 1000, remaining: 1000, reset_after: 0, max_concurrency: 1 },
    });
    const manager = new WebSocketManager({ token: 'test-token', intents: 0, rest });
    const outcomes: unknown[] = [];
    void manager.connect().then(
      () => outcomes.push('connected'),
      (cause: unknown) => outcomes.push(cause),
    );
    const socket = await reached;
    await manager.destroy();
    socket.destroy();
    await once(socket, 'close');
    await new Promise((resolve) => setImmediate(resolve));
    expect((await manager.fetchStatus()).size).toBe(0);
    expect(outcomes).not.toContain('connected');

  });
});
