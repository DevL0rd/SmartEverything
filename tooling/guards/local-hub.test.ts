import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createClientToken } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout, V1_NAMES, type HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { dataLayoutOf } from '../release-hub-files.ts';
import {
  LocalHubAddressError,
  LocalHubNotRunningError,
  LocalHubTokenError,
  localHub,
} from '../local-hub.ts';

const TOKEN = createClientToken();
const base = { root: '' };

beforeEach(async () => {
  base.root = await mkdtemp(join(tmpdir(), 'local-hub-'));
});

afterEach(async () => {
  await rm(base.root, { recursive: true, force: true });
});

async function put(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

function ready(url: string): string {
  return JSON.stringify({ pid: 1, url, version: '1.0.0' });
}

async function announce(layout: HubLayout, url: string, token: string): Promise<void> {
  await put(layout.system.run.ready, ready(url));
  await put(layout.system.keys.ownerToken, `${token}\n`);
}

describe('the local hub', () => {
  it('reads the ready file and owner token of a V1 data folder', async () => {
    await put(join(base.root, V1_NAMES.marker), '{}');
    const layout = dataLayoutOf(base.root);
    expect(layout.system.run.ready).toBe(join(base.root, 'system/run/service-ready.json'));
    await announce(layout, 'http://127.0.0.1:7880', TOKEN);
    const hub = await localHub(layout);
    expect(hub.url.origin).toBe('http://127.0.0.1:7880');
    expect(hub.token).toBe(TOKEN);
  });

  it('reads the flat names of a legacy data folder', async () => {
    const layout = dataLayoutOf(base.root);
    expect(layout.system.run.ready).toBe(join(base.root, 'service-ready.json'));
    await announce(layout, 'http://[::1]:7880', TOKEN);
    expect((await localHub(layout)).url.hostname).toBe('[::1]');
  });

  it('names the missing ready file when the hub is not running', async () => {
    await expect(localHub(hubLayout(base.root, {}))).rejects.toThrow(LocalHubNotRunningError);
  });

  it('refuses an address that is not the loopback http listener', async () => {
    const layout = hubLayout(base.root, {});
    await announce(layout, 'http://192.168.1.4:7880', TOKEN);
    await expect(localHub(layout)).rejects.toThrow(LocalHubAddressError);
    await announce(layout, 'https://127.0.0.1:7880', TOKEN);
    await expect(localHub(layout)).rejects.toThrow();
  });

  it('refuses a token file that holds anything else or is missing', async () => {
    const layout = hubLayout(base.root, {});
    await put(layout.system.run.ready, ready('http://127.0.0.1:7880'));
    await expect(localHub(layout)).rejects.toThrow(LocalHubTokenError);
    await put(layout.system.keys.ownerToken, 'not a token');
    await expect(localHub(layout)).rejects.toThrow(LocalHubTokenError);
  });

  it('never puts the token in an error message', async () => {
    const layout = hubLayout(base.root, {});
    await announce(layout, 'http://192.168.1.4:7880', TOKEN);
    const failure = await localHub(layout).catch((cause: unknown) => cause);
    expect(String(failure)).not.toContain(TOKEN);
  });
});
