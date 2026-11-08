import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PLUGIN_MODEL_CONTRIBUTION, type PluginModelContribution } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModelCatalogService } from '../../src/models/catalog-service';
import { MODEL_SPEC_BYTE_LIMIT } from '../../src/models/contributions';
import {
  loadPluginModelEntries,
  statusDetailOf,
  syncPluginModels,
  type PluginAssetOrigin,
} from '../../src/plugins/plugin-models';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ModelAssetsRepository, sha256Of } from '../../src/store/repositories/model-assets';
import { ModelCatalogRepository } from '../../src/store/repositories/model-catalog';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';
import { jsonBytes, specOf } from '../models/model-fixtures';

const NOW = '2026-10-25T10:00:00.000Z';
const MANIFEST_URL = 'https://plugin.example/mcp';
const SPEC = jsonBytes(specOf('dev.fan.example'));

let service: ModelCatalogService;
let folder: string;
let outside: string;

beforeEach(async () => {
  const sql = new Sql(new DatabaseSync(':memory:', { enableForeignKeyConstraints: true }));
  migrate(sql, MIGRATIONS, NOW, testLogger());
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  service = new ModelCatalogService({
    assets: new ModelAssetsRepository(context),
    catalog: new ModelCatalogRepository(context),
  });
  const root = await mkdtemp(join(tmpdir(), 'plugin-models-'));
  folder = join(root, 'plugin');
  outside = join(root, 'outside');
  await mkdir(join(folder, 'models'), { recursive: true });
  await mkdir(outside);
});

afterEach(async () => {
  await rm(join(folder, '..'), { recursive: true, force: true });
});

function declared(overrides: Record<string, unknown> = {}): PluginModelContribution {
  return PLUGIN_MODEL_CONTRIBUTION.parse({
    id: 'dev.fan.example',
    title: 'Example fan',
    version: '1.0.0',
    match: { exact: ['wiz.fan'] },
    spec: 'models/fan.json',
    ...overrides,
  });
}

function asIs(contribution: PluginModelContribution, spec: string): PluginModelContribution {
  return { ...contribution, spec };
}

function folderOrigin(): PluginAssetOrigin {
  return { kind: 'folder', folder };
}

async function problemOf(
  origin: PluginAssetOrigin,
  contribution: PluginModelContribution,
): Promise<string | null> {
  const [entry] = await loadPluginModelEntries(origin, [contribution]);
  const content = entry?.spec.content;
  return content !== undefined && 'problem' in content ? content.problem : null;
}

describe('local plugin assets', () => {
  it('reads the spec inside the plugin folder and stores them', async () => {
    await writeFile(join(folder, 'models', 'fan.json'), SPEC);
    const result = await syncPluginModels(service, 'wiz', folderOrigin(), [declared()]);
    expect(result.accepted).toEqual(['dev.fan.example']);
    expect(result.statusDetail).toBeNull();
    expect(service.catalog().rows.map((row) => row.spec_sha256)).toEqual([sha256Of(SPEC)]);
  });

  it('rejects dot-dot segments and absolute paths without touching the disk', async () => {
    await writeFile(join(outside, 'secret.json'), SPEC);
    const escaping = await problemOf(folderOrigin(), asIs(declared(), '../outside/secret.json'));
    const absolute = await problemOf(
      folderOrigin(),
      asIs(declared(), join(outside, 'secret.json')),
    );
    expect(escaping).toContain('relative path inside the plugin folder');
    expect(absolute).toContain('relative path inside the plugin folder');
  });

  it('rejects a symlink that leaves the plugin folder and a folder symlink that does', async () => {
    await writeFile(join(outside, 'secret.json'), SPEC);
    await symlink(join(outside, 'secret.json'), join(folder, 'models', 'fan.json'));
    await symlink(outside, join(folder, 'models', 'linked'));
    expect(await problemOf(folderOrigin(), declared())).toContain('outside the plugin folder');
    expect(
      await problemOf(folderOrigin(), declared({ spec: 'models/linked/secret.json' })),
    ).toContain('outside the plugin folder');
  });

  it('follows a symlink that stays inside the plugin folder', async () => {
    await writeFile(join(folder, 'models', 'real.json'), SPEC);
    await symlink(join(folder, 'models', 'real.json'), join(folder, 'models', 'fan.json'));
    expect(await problemOf(folderOrigin(), declared())).toBeNull();
  });

  it('names a missing file and a directory', async () => {
    expect(await problemOf(folderOrigin(), declared())).toContain('was not found');
    expect(await problemOf(folderOrigin(), declared({ spec: 'models' }))).toContain('not a file');
  });

  it('stops reading a spec past the byte limit and reports the limit', async () => {
    await writeFile(join(folder, 'models', 'fan.json'), new Uint8Array(MODEL_SPEC_BYTE_LIMIT + 1));
    expect(await problemOf(folderOrigin(), declared())).toContain(
      `over the ${String(MODEL_SPEC_BYTE_LIMIT)} byte limit`,
    );
  });

  it('refuses a file that does not match the declared sha256 and still runs the rest', async () => {
    await writeFile(join(folder, 'models', 'fan.json'), SPEC);
    await writeFile(join(folder, 'models', 'bad.json'), SPEC);
    const result = await syncPluginModels(service, 'wiz', folderOrigin(), [
      declared(),
      declared({ id: 'dev.bad.example', spec: 'models/bad.json', specSha256: '0'.repeat(64) }),
    ]);
    expect(result.accepted).toEqual(['dev.fan.example']);
    expect(result.statusDetail).toContain('models/bad.json (dev.bad.example)');
    expect(result.statusDetail).toContain('sha256');
  });
});

function urlOf(input: string | URL | Request): string {
  if (input instanceof URL) return input.href;
  return input instanceof Request ? input.url : input;
}

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(
  routes: Readonly<Record<string, () => Response>>,
  calls: Call[] = [],
): typeof fetch {
  return (input, init) => {
    const url = urlOf(input);
    calls.push({ url, init: init ?? {} });
    const route = routes[url];
    return Promise.resolve(route === undefined ? new Response('no', { status: 404 }) : route());
  };
}

function urlOrigin(fetcher: typeof fetch, manifestUrl: string = MANIFEST_URL): PluginAssetOrigin {
  return { kind: 'url', manifestUrl, fetch: fetcher };
}

function redirect(to: string): () => Response {
  return () => new Response(null, { status: 302, headers: { location: to } });
}

describe('url plugin assets', () => {
  it('fetches from the manifest origin with no credentials, no cookies and a timeout', async () => {
    const calls: Call[] = [];
    const fetcher = fakeFetch(
      { 'https://plugin.example/models/fan.json': () => new Response(SPEC) },
      calls,
    );
    const result = await syncPluginModels(service, 'wiz', urlOrigin(fetcher), [declared()]);
    expect(result.accepted).toEqual(['dev.fan.example']);
    const init = calls[0]?.init;
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(init?.headers ?? {})).toEqual(['accept']);
  });

  it('follows redirects inside the origin and refuses those that leave it', async () => {
    const inside = fakeFetch({
      'https://plugin.example/models/fan.json': redirect('/cdn/fan.json'),
      'https://plugin.example/cdn/fan.json': () => new Response(SPEC),
    });
    expect(await problemOf(urlOrigin(inside), declared())).toBeNull();
    const leaving = fakeFetch({
      'https://plugin.example/models/fan.json': redirect('https://other.example/fan.json'),
    });
    expect(await problemOf(urlOrigin(leaving), declared())).toContain('other.example');
    const downgrade = fakeFetch({
      'https://plugin.example/models/fan.json': redirect('http://plugin.example/fan.json'),
    });
    expect(await problemOf(urlOrigin(downgrade), declared())).toContain('redirects outside');
  });

  it('stops a redirect loop', async () => {
    const loop = fakeFetch({
      'https://plugin.example/models/fan.json': redirect('/b.json'),
      'https://plugin.example/b.json': redirect('/models/fan.json'),
    });
    expect(await problemOf(urlOrigin(loop), declared())).toContain('loop');
  });

  it('serves plain http only when the manifest itself came from that http origin', async () => {
    const lan = 'http://192.168.1.20:8080/mcp';
    const fetcher = fakeFetch({
      'http://192.168.1.20:8080/models/fan.json': () => new Response(SPEC),
    });
    expect(await problemOf(urlOrigin(fetcher, lan), declared())).toBeNull();
    const secure = fakeFetch({
      'https://plugin.example/models/fan.json': redirect('http://plugin.example/models/fan.json'),
    });
    expect(await problemOf(urlOrigin(secure), declared())).toContain('redirects outside');
  });

  it('refuses plain http when the manifest origin is not a LAN host', async () => {
    const fetcher = fakeFetch({
      'http://plugin.example/models/fan.json': () => new Response(SPEC),
    });
    expect(await problemOf(urlOrigin(fetcher, 'http://plugin.example/mcp'), declared())).toContain(
      'is not served over https',
    );
    const publicIp = fakeFetch({ 'http://8.8.8.8/models/fan.json': () => new Response(SPEC) });
    expect(await problemOf(urlOrigin(publicIp, 'http://8.8.8.8/mcp'), declared())).toContain(
      'is not served over https',
    );
    const local = fakeFetch({ 'http://hub.local/models/fan.json': () => new Response(SPEC) });
    expect(await problemOf(urlOrigin(local, 'http://hub.local/mcp'), declared())).toBeNull();
  });

  it('aborts a body that streams past the byte limit', async () => {
    let cancelled = false;
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller): void {
        pulled += 1;
        controller.enqueue(new Uint8Array(100 * 1024));
      },
      cancel(): void {
        cancelled = true;
      },
    });
    const fetcher = fakeFetch({
      'https://plugin.example/models/fan.json': () => new Response(stream),
    });
    expect(await problemOf(urlOrigin(fetcher), declared())).toContain('byte limit');
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it('refuses a declared content length over the limit before reading', async () => {
    const fetcher = fakeFetch({
      'https://plugin.example/models/fan.json': () =>
        new Response(SPEC, { headers: { 'content-length': String(MODEL_SPEC_BYTE_LIMIT + 1) } }),
    });
    expect(await problemOf(urlOrigin(fetcher), declared())).toContain('byte limit');
  });

  it('reports an HTTP error and a network failure and keeps the good models', async () => {
    const fetcher: typeof fetch = (input) => {
      const url = urlOf(input);
      if (url.endsWith('/models/fan.json')) return Promise.resolve(new Response(SPEC));
      if (url.endsWith('/models/down.json')) return Promise.reject(new Error('connection refused'));
      return Promise.resolve(new Response('no', { status: 503 }));
    };
    const result = await syncPluginModels(service, 'wiz', urlOrigin(fetcher), [
      declared(),
      declared({ id: 'dev.down.example', spec: 'models/down.json' }),
      declared({ id: 'dev.busy.example', spec: 'models/busy.json' }),
    ]);
    expect(result.accepted).toEqual(['dev.fan.example']);
    expect(result.statusDetail).toContain('models/down.json (dev.down.example)');
    expect(result.statusDetail).toContain('connection refused');
    expect(result.statusDetail).toContain('HTTP 503');
  });
});

describe('status detail', () => {
  it('is null without rejections and names the file and the problem', () => {
    expect(statusDetailOf([])).toBeNull();
    expect(statusDetailOf([{ id: 'a.b', file: 'm/a.json', problem: 'is empty' }])).toBe(
      'Model files rejected: m/a.json (a.b) is empty',
    );
  });

  it('fits the 400 character column and says how many more were rejected', () => {
    const rejections = Array.from({ length: 30 }, (_, index) => ({
      id: `dev.item${String(index)}`,
      file: `models/item${String(index)}.json`,
      problem: 'is not a valid model spec',
    }));
    const detail = statusDetailOf(rejections);
    expect(detail?.length).toBeLessThanOrEqual(400);
    expect(detail).toMatch(/; and \d+ more \(see the hub log\)$/);
    expect(detail).toContain('models/item0.json');
  });

  it('shortens a single very long rejection to the column', () => {
    const detail = statusDetailOf([{ id: 'a.b', file: 'f.json', problem: 'x'.repeat(900) }]);
    expect(detail?.length).toBe(400);
  });
});
