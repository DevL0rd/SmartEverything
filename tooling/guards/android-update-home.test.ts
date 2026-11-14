import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createClientToken } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { V1_NAMES } from '../../apps/hub/src/data-layout/index.ts';
import { readAndroidUpdateHome } from '../android-update-home.ts';
import { dataLayoutOf } from '../release-hub-files.ts';

const TOKEN = createClientToken();
const state: { root: string; server: Server | undefined; seen: string[] } = {
  root: '',
  server: undefined,
  seen: [],
};

async function put(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function listen(status: number): Promise<string> {
  const server = createServer((request, response) => {
    state.seen.push(`${request.url ?? ''} ${request.headers.authorization ?? ''}`);
    response.writeHead(status, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  state.server = server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  return `http://127.0.0.1:${String(address.port)}`;
}

beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'android-update-home-'));
  state.seen = [];
  await put(join(state.root, V1_NAMES.marker), '{}');
});

afterEach(async () => {
  state.server?.closeAllConnections();
  await new Promise((resolve) => state.server?.close(resolve));
  state.server = undefined;
  await rm(state.root, { recursive: true, force: true });
});

async function announce(url: string): Promise<ReturnType<typeof dataLayoutOf>> {
  const layout = dataLayoutOf(state.root);
  await put(layout.system.run.ready, JSON.stringify({ pid: 1, url, version: '1.0.0' }));
  await put(layout.system.keys.ownerToken, `${TOKEN}\n`);
  return layout;
}

describe('reading Android update information from the local hub', () => {
  it('finds the hub and token through the V1 layout and sends the owner token', async () => {
    const layout = await announce(await listen(200));
    await expect(readAndroidUpdateHome(layout, '/api/x')).resolves.toStrictEqual({ ok: true });
    expect(state.seen).toStrictEqual([`/api/x Bearer ${TOKEN}`]);
  });

  it('names the refused status when the hub answers an error', async () => {
    const layout = await announce(await listen(403));
    await expect(readAndroidUpdateHome(layout, '/api/x')).rejects.toThrow(/403/u);
  });

  it('refuses a path that leaves the hub origin', async () => {
    const layout = await announce(await listen(200));
    await expect(readAndroidUpdateHome(layout, 'http://other.test/api/x')).rejects.toThrow(
      /local hub listener/u,
    );
    expect(state.seen).toStrictEqual([]);
  });
});
