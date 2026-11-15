import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { systemClaudeCli } from '../../src/claude/claude-cli';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-claude-cli-'));
  await writeFile(join(directory, 'claude'), '#!/bin/sh\nprintf "%s" "$CLAUDE_CONFIG_DIR"\n');
  await chmod(join(directory, 'claude'), 0o755);
  vi.stubEnv('PATH', directory);
  vi.stubEnv('CLAUDE_CONFIG_DIR', '/the/real/claude');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it('runs the Claude program in the given Claude home instead of the inherited one', async () => {
  expect(await systemClaudeCli(join(directory, 'home'))(['plugin', 'list'])).toBe(
    join(directory, 'home'),
  );
});

it('keeps the inherited Claude home only when the caller names none', async () => {
  expect(await systemClaudeCli(null)(['plugin', 'list'])).toBe('/the/real/claude');
});
