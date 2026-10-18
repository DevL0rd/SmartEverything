import { PLUGIN_MANIFEST } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConversationAuthority } from '../../src/harness/authority-contract';
import { pluginCallAuthority, withPluginCallAuthority } from '../../src/plugins/call-authority';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

function manifest(id: string): ReturnType<typeof PLUGIN_MANIFEST.parse> {
  return PLUGIN_MANIFEST.parse({
    id,
    name: id,
    version: '1.0.0',
    description: 'A plugin for tests',
    publisher: 'Tests',
    mcp: { transport: 'stdio', command: 'node', args: [] },
    permissions: { seAreas: ['devices'], inbound: false },
  });
}

function authority(eventId: string): ConversationAuthority {
  return {
    event_id: eventId,
    profile_id: '00000000-0000-4000-8000-000000000003',
    client_id: null,
    kind: 'service',
    role: 'owner',
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

const FIRST = authority('00000000-0000-4000-8000-0000000000a1');
const SECOND = authority('00000000-0000-4000-8000-0000000000a2');

function held(): { readonly release: () => void; readonly wait: Promise<void> } {
  let release = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, wait };
}

beforeEach(async () => {
  opened = await testStore();
  opened.store.plugins.create({
    manifest: manifest('shelly'),
    source: 'builtin',
    location: null,
    trusted: true,
  });
  opened.store.plugins.create({
    manifest: manifest('outside'),
    source: 'local',
    location: null,
    trusted: true,
  });
});

afterEach(async () => {
  await opened.close();
});

describe('plugin calls from different events', () => {
  it('run side by side for a built-in plugin', async () => {
    const gate = held();
    const running = withPluginCallAuthority(opened.store, 'shelly', FIRST, () =>
      gate.wait.then(() => 'first'),
    );

    const second = await withPluginCallAuthority(opened.store, 'shelly', SECOND, () =>
      Promise.resolve('second'),
    );
    gate.release();

    expect(second).toBe('second');
    await expect(running).resolves.toBe('first');
    expect(pluginCallAuthority(opened.store, 'shelly')).toBeUndefined();
  });

  it('are refused for an external plugin that is already serving another event', async () => {
    const gate = held();
    const running = withPluginCallAuthority(opened.store, 'outside', FIRST, () => gate.wait);

    await expect(
      withPluginCallAuthority(opened.store, 'outside', SECOND, () => Promise.resolve()),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(pluginCallAuthority(opened.store, 'outside')).toBe(FIRST);
    gate.release();
    await running;
  });
});
