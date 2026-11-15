import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HelperMetaPort,
  MetaPortError,
  NoXattrPort,
  canonicalXattrs,
  createMetaPort,
  mergedXattrs,
  sameXattrs,
} from '../../src/drive-sync/meta-port.js';

const log = new Logger('desktop.drive-sync');

const HELPER = `#!${process.execPath}
const readline = require('node:readline');
const held = new Map();
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  const reply = { id: request.id, ok: true };
  if (request.op === 'read') {
    if (request.paths.some((path) => path.includes('crash'))) process.exit(3);
    reply.entries = request.paths.map((path) =>
      path.includes('missing')
        ? { path, xattrs: [], code: 'ENOENT' }
        : { path, xattrs: held.get(path) ?? [] },
    );
  } else if (request.op === 'xattrs') {
    if (request.path.includes('refused')) {
      reply.ok = false;
      reply.code = 'EPERM';
      reply.message = 'not permitted';
    } else {
      held.set(request.path, request.xattrs ?? []);
    }
  } else if (request.op === 'mtime') {
    reply.ok = true;
  }
  process.stdout.write(JSON.stringify(reply) + '\\n');
});
`;

let scratch = '';
let binary = '';
const opened: HelperMetaPort[] = [];

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'drive-sync-meta-port-'));
  binary = join(scratch, 'helper');
  await writeFile(binary, HELPER);
  await chmod(binary, 0o755);
});

afterEach(async () => {
  for (const port of opened.splice(0)) await port.close();
  await rm(scratch, { recursive: true, force: true });
});

function port(): HelperMetaPort {
  const created = new HelperMetaPort({ binary, log });
  opened.push(created);
  return created;
}

const TAG = { name: 'user.tag', value: 'cmVk' };

describe('HelperMetaPort', () => {
  it('writes attributes and reads them back per path', async () => {
    const helper = port();
    await helper.applyXattrs('/a', [TAG]);
    const found = await helper.xattrsOf(['/a', '/b']);
    expect(found.get('/a')).toEqual([TAG]);
    expect(found.get('/b')).toEqual([]);
  });

  it('reports a path the helper could not read as unknown', async () => {
    const found = await port().xattrsOf(['/missing/file', '/ok']);
    expect(found.get('/missing/file')).toBeNull();
    expect(found.get('/ok')).toEqual([]);
  });

  it('turns a refusal into an error that names the code', async () => {
    await expect(port().applyXattrs('/refused', [TAG])).rejects.toMatchObject({
      name: 'MetaPortError',
      code: 'EPERM',
    });
    await expect(port().applyXattrs('/refused', [TAG])).rejects.toBeInstanceOf(MetaPortError);
  });

  it('answers many calls at once in the order of their ids', async () => {
    const helper = port();
    await Promise.all([helper.applyXattrs('/x', [TAG]), helper.applyXattrs('/y', [])]);
    const [x, y] = await Promise.all([helper.xattrsOf(['/x']), helper.xattrsOf(['/y'])]);
    expect(x.get('/x')).toEqual([TAG]);
    expect(y.get('/y')).toEqual([]);
  });

  it('sets a modification time with nanoseconds', async () => {
    await expect(port().setMtime('/a', 1_700_000_000_123_456_789n)).resolves.toBeUndefined();
  });

  it('fails the calls waiting on a helper that dies and starts a new one for the next call', async () => {
    const helper = port();
    await helper.applyXattrs('/kept', [TAG]);
    await expect(helper.xattrsOf(['/crash-me'])).rejects.toThrow('stopped answering');
    const second = await helper.xattrsOf(['/kept']);
    expect(second.get('/kept')).toEqual([]);
  });

  it('refuses calls after it was closed', async () => {
    const helper = port();
    await helper.xattrsOf(['/a']);
    await helper.close();
    await expect(helper.xattrsOf(['/a'])).rejects.toThrow('stopped answering');
  });
});

describe('createMetaPort', () => {
  it('uses the helper on Linux and a port without attributes elsewhere', async () => {
    const linux = createMetaPort({ binary, platform: 'linux', log });
    const windows = createMetaPort({ binary, platform: 'win32', log });
    expect(linux.supported).toBe(true);
    expect(windows).toBeInstanceOf(NoXattrPort);
    expect(windows.supported).toBe(false);
    await linux.close();
    await windows.close();
  });

  it('reports every path as unknown without a helper', async () => {
    const found = await new NoXattrPort().xattrsOf(['/a']);
    expect(found.get('/a')).toBeNull();
  });
});

describe('attribute lists', () => {
  it('orders by name, compares by content and keeps foreign namespaces from the hub', () => {
    const user = { name: 'user.b', value: 'Yg==' };
    const first = { name: 'user.a', value: 'YQ==' };
    const foreign = { name: 'security.x', value: 'eA==' };
    expect(canonicalXattrs([user, first])).toEqual([first, user]);
    expect(sameXattrs([first, user], [first, user])).toBe(true);
    expect(sameXattrs([first], [first, user])).toBe(false);
    expect(sameXattrs([first], [{ ...first, value: 'Zg==' }])).toBe(false);
    expect(mergedXattrs([user, foreign], [first, foreign])).toEqual([foreign, user]);
  });
});
