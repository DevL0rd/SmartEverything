import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const spawned: { env: NodeJS.ProcessEnv }[] = [];

vi.mock('node:child_process', () => ({
  spawn: (
    _program: string,
    _args: readonly string[],
    options: { env: NodeJS.ProcessEnv },
  ): object => {
    spawned.push(options);
    return {};
  },
}));

import { hubLayout, nodeLayout } from '../../src/data-layout';
import { launchCodex } from '../../src/codex/process';
import { hubCodexSites, nodeCodexSites } from '../../src/codex/sites';

it('launches hub Codex with the hub home and keeps the person home on a Computer', async () => {
  vi.stubEnv('CODEX_HOME', '/home/person/.codex');
  await launchCodex({}, '/data/system/ai/codex-home', 'provider');
  await launchCodex({}, null, 'provider');
  expect(spawned[0]?.env['CODEX_HOME']).toBe('/data/system/ai/codex-home');
  expect(spawned[1]?.env['CODEX_HOME']).toBe('/home/person/.codex');
  vi.unstubAllEnvs();
});

it('places chat workspaces by profile in the layout and operations under the Codex folder', () => {
  const layout = hubLayout('/data', {});
  const sites = hubCodexSites(layout);
  expect(sites.chatWorkspace('profile-a', 'chat-1')).toBe(layout.chat('profile-a', 'chat-1').codex);
  expect(sites.operationWorkspace('op-1')).toBe(join(layout.system.ai.codex, 'workspaces', 'op-1'));
  expect(sites.directory).toBe(layout.system.ai.codex);
  expect(sites.inputs).toBe(layout.cache.codexInputs);
  expect(sites.home).toBe(layout.system.ai.codexHome);
});

it('keeps the Computer Codex folders under the node folder with no vendor home', () => {
  const node = nodeLayout('/node');
  const sites = nodeCodexSites(node);
  expect(sites.directory).toBe(node.codex);
  expect(sites.inputs).toBe(node.codexInputs);
  expect(sites.home).toBeNull();
  expect(sites.chatWorkspace('p', 'chat-1')).toBe(join(node.codex, 'workspaces', 'chat-1'));
});
