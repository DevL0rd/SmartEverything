import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request) => Promise<Response>;

const registered: { scheme: string; handler: Handler }[] = [];
const fetched: string[] = [];

vi.mock('electron', () => ({
  protocol: {
    handle: (scheme: string, handler: Handler): void => {
      registered.push({ scheme, handler });
    },
    registerSchemesAsPrivileged: (): void => undefined,
  },
  net: {
    fetch: (url: string): Promise<Response> => {
      fetched.push(url);
      return Promise.resolve(new Response('file'));
    },
  },
}));

const { serveWebExport } = await import('../src/protocol.js');
const { APP_HOST, APP_SCHEME } = await import('../src/origin.js');

let parent = '';

beforeEach(async () => {
  registered.length = 0;
  fetched.length = 0;
  parent = await mkdtemp(path.join(tmpdir(), 'protocol-'));
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

async function rootWith(name: string, files: readonly string[]): Promise<string> {
  const root = path.join(parent, name);
  await mkdir(root, { recursive: true });
  for (const file of files) await writeFile(path.join(root, file), file);
  return root;
}

function handlerFor(root: () => string): Handler {
  serveWebExport(root);
  const handler = registered.at(-1);
  expect(handler?.scheme).toBe(APP_SCHEME);
  if (handler === undefined) throw new Error('serveWebExport registered no handler');
  return handler.handler;
}

const requestOf = (pathname: string, method = 'GET'): Request =>
  new Request(`${APP_SCHEME}://${APP_HOST}${pathname}`, { method });

describe('serving the web export', () => {
  it('asks the resolver on every request so a swapped root is served at once', async () => {
    const embedded = await rootWith('embedded', ['index.html', 'app.js']);
    const updated = await rootWith('updated', ['index.html', 'app.js']);
    let current = embedded;
    const calls: string[] = [];
    const handle = handlerFor(() => {
      calls.push(current);
      return current;
    });

    await handle(requestOf('/app.js'));
    current = updated;
    await handle(requestOf('/app.js'));
    await handle(requestOf('/'));

    expect(calls).toStrictEqual([embedded, updated, updated]);
    expect(fetched).toStrictEqual([
      pathToFileURL(path.join(embedded, 'app.js')).toString(),
      pathToFileURL(path.join(updated, 'app.js')).toString(),
      pathToFileURL(path.join(updated, 'index.html')).toString(),
    ]);
  });

  it('answers 404 for a file the current root does not have, even if the old root did', async () => {
    const embedded = await rootWith('embedded', ['index.html', 'old.js']);
    const updated = await rootWith('updated', ['index.html']);
    let current = embedded;
    const handle = handlerFor(() => current);

    expect((await handle(requestOf('/old.js'))).status).toBe(200);
    current = updated;

    expect((await handle(requestOf('/old.js'))).status).toBe(404);
  });

  it('refuses writes without asking for a file', async () => {
    const root = await rootWith('embedded', ['index.html']);
    const handle = handlerFor(() => root);

    const response = await handle(requestOf('/index.html', 'POST'));

    expect(response.status).toBe(405);
    expect(fetched).toStrictEqual([]);
  });
});
