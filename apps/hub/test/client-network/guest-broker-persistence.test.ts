import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { HubGuestBroker } from '../../src/client-network/guest-broker';
import { captureLogs, testLogger } from '../support/logs';

const ORIGIN = 'https://hub.example';
const TOKEN = `scg_${'A'.repeat(43)}`;
const ADDRESS = { url: `${ORIGIN}/mcp`, pin: null } as const;

let directory: string;
const closers: (() => Promise<void> | void)[] = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'guest-broker-persist-'));
});

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  await rm(directory, { recursive: true, force: true });
});

function create(port: number): HubGuestBroker {
  const broker = new HubGuestBroker(
    {
      lease: (url): { url: URL; signal: AbortSignal; generation: number } => ({
        url: new URL(url),
        signal: new AbortController().signal,
        generation: 1,
      }),
      failed: (): undefined => undefined,
      view: { trust: null },
    },
    ORIGIN,
    { port, directory, log: testLogger() },
  );
  closers.push(() => {
    broker.close();
  });
  return broker;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => {
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  await new Promise<void>((resolve) => {
    probe.close(() => {
      resolve();
    });
  });
  if (address === null || typeof address === 'string') throw new Error('no port');
  return address.port;
}

it('keeps the same port and URL after a restart and kills it on revoke', async () => {
  const port = await freePort();
  const first = create(port);
  await first.start();
  const url = first.openMcp('claude', ADDRESS, TOKEN);
  expect(url).toMatch(
    new RegExp(`^http://127\\.0\\.0\\.1:${String(port)}/guest/[0-9a-f]{64}/mcp$`),
  );
  first.closeOwner('mcp:claude');
  first.close();
  const second = create(port);
  await second.start();
  expect(second.openMcp('claude', ADDRESS, TOKEN)).toBe(url);
  const mode = (await stat(join(directory, 'mcp-claude.grant-id'))).mode & 0o777;
  expect(mode).toBe(0o600);
  second.revokeMcp('claude');
  await expect(readFile(join(directory, 'mcp-claude.grant-id'), 'utf8')).rejects.toThrow();
  const response = await fetch(url);
  expect(response.status).toBe(409);
  expect(second.openMcp('claude', ADDRESS, TOKEN)).not.toBe(url);
});

it('fails the start and logs the port and code when the port is taken', async () => {
  const port = await freePort();
  const blocker: Server = createServer();
  await new Promise<void>((resolve) => {
    blocker.listen(port, '127.0.0.1', resolve);
  });
  closers.push(
    () =>
      new Promise<void>((resolve) => {
        blocker.close(() => {
          resolve();
        });
      }),
  );
  const logs = captureLogs();
  const broker = new HubGuestBroker(
    {
      lease: (): never => {
        throw new Error('unused');
      },
      failed: (): undefined => undefined,
      view: { trust: null },
    },
    ORIGIN,
    { port, directory, log: testLogger() },
  );
  await expect(broker.start()).rejects.toThrow(
    new RegExp(`127\\.0\\.0\\.1:${String(port)}.*EADDRINUSE`),
  );
  const record = logs.records.find((candidate) => candidate.event === 'guest_broker.bind_failed');
  expect(record).toBeDefined();
  expect(JSON.stringify(record)).toContain('EADDRINUSE');
  expect(JSON.stringify(record)).toContain(String(port));
});
