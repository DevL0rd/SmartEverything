import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { ClaudeLink } from '../../src/claude/link';
import { testLogger } from '../support/logs';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-claude-link-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('installs the link without copying the Claude plugin registry anywhere', async () => {
  const link = new ClaudeLink({
    directory,
    launch: { command: 'node', script: 'helper.mjs', directory, ready: join(directory, 'ready') },
    token: {
      verify: (): boolean => true,
      read: (): Promise<string | null> => Promise.resolve('token'),
      ensure: (): Promise<string> => Promise.resolve('token'),
      revoke: (): Promise<void> => Promise.resolve(),
      retireBridge: (): number => 0,
    },
    cli: (): Promise<string> => Promise.resolve('[]'),
    readUrl: (): Promise<string> => Promise.resolve('http://127.0.0.1:1'),
    log: testLogger(),
    changed: (): undefined => undefined,
  });
  await link.install().catch(() => undefined);
  expect(existsSync(join(directory, 'link'))).toBe(true);
  expect(await readdir(directory)).toStrictEqual(['link']);
});
