import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createClientToken } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { V1_NAMES } from '../../apps/hub/src/data-layout/index.ts';
import { dataLayoutOf } from '../release-hub-files.ts';
import { observations } from '../self-update-app-command.ts';

const CLIENT = '0192b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b';
const state: { root: string; server: Server | undefined; seen: string[] } = {
  root: '',
  server: undefined,
  seen: [],
};

async function put(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

async function serve(body: string): Promise<void> {
  const server = createServer((request, response) => {
    state.seen.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  state.server = server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  const layout = dataLayoutOf(state.root);
  await put(
    layout.system.run.ready,
    JSON.stringify({ pid: 1, url: `http://127.0.0.1:${String(address.port)}`, version: '1.0.0' }),
  );
  await put(layout.system.keys.ownerToken, `${createClientToken()}\n`);
}

beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'app-observations-'));
  state.seen = [];
  await put(join(state.root, V1_NAMES.marker), '{}');
});

afterEach(async () => {
  state.server?.closeAllConnections();
  await new Promise((resolve) => state.server?.close(resolve));
  state.server = undefined;
  await rm(state.root, { recursive: true, force: true });
});

describe('reading paired Android builds from the local hub layout', () => {
  it('lists every paired build through the layout', async () => {
    await serve('[]');
    await expect(observations(dataLayoutOf(state.root))).resolves.toStrictEqual([]);
    expect(state.seen).toHaveLength(1);
  });

  it('reads one paired device through the layout', async () => {
    await serve('null');
    await expect(observations(dataLayoutOf(state.root), CLIENT)).resolves.toStrictEqual([]);
    expect(state.seen[0]).toContain(CLIENT);
  });
});
