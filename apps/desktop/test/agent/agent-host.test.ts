import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_AGENT_ADDRESS, SESSION_AGENT_FILE } from '@smarteverything/domain';
import type { AgentActions } from '../../src/agent/agent-actions.js';
import { agentSocketPath, startSessionAgent } from '../../src/agent/agent-host.js';

const ACTIONS: AgentActions = {
  open: () => Promise.resolve(),
  ring: () => Promise.resolve(),
  capture: () => Promise.reject(new Error('unused')),
};

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agent-host-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

describe('the session agent host', () => {
  it('writes an owner-only address with a fresh token and a socket only the owner can reach', async () => {
    const agent = await startSessionAgent({
      directory,
      platform: 'linux',
      actions: ACTIONS,
    });
    const file = join(directory, SESSION_AGENT_FILE);
    const address = SESSION_AGENT_ADDRESS.parse(JSON.parse(await readFile(file, 'utf8')));
    expect(address.socket).toBe(join(directory, 'session-agent.sock'));
    expect(address.pid).toBe(process.pid);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(address.socket)).mode & 0o777).toBe(0o600);
    await agent.stop();
    const second = await startSessionAgent({
      directory,
      platform: 'linux',
      actions: ACTIONS,
    });
    const next = SESSION_AGENT_ADDRESS.parse(JSON.parse(await readFile(file, 'utf8')));
    expect(next.token).not.toBe(address.token);
    await second.stop();
  });

  it('removes the address and the socket when it stops', async () => {
    const agent = await startSessionAgent({
      directory,
      platform: 'linux',
      actions: ACTIONS,
    });
    await agent.stop();
    expect(await exists(join(directory, SESSION_AGENT_FILE))).toBe(false);
    expect(await exists(join(directory, 'session-agent.sock'))).toBe(false);
  });

  it('replaces what a crashed app left behind', async () => {
    await writeFile(join(directory, 'session-agent.sock'), 'stale');
    await writeFile(join(directory, SESSION_AGENT_FILE), '{"stale":true}');
    const agent = await startSessionAgent({
      directory,
      platform: 'linux',
      actions: ACTIONS,
    });
    SESSION_AGENT_ADDRESS.parse(
      JSON.parse(await readFile(join(directory, SESSION_AGENT_FILE), 'utf8')),
    );
    await agent.stop();
  });

  it('names a Windows pipe after the data directory so two roles never share one', () => {
    const first = agentSocketPath(
      'C:\\Users\\ann\\AppData\\Roaming\\SmartEverything-node',
      'win32',
    );
    const other = agentSocketPath('C:\\Users\\ann\\AppData\\Roaming\\SmartEverything', 'win32');
    expect(first).toMatch(/^\\\\\.\\pipe\\smarteverything-agent-[0-9a-f]{16}$/);
    expect(first).not.toBe(other);
  });
});
