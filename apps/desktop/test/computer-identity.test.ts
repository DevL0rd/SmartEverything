import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseServiceConfigText } from '@smarteverything/hub/service/configuration';
import { computerMachineId } from '@smarteverything/hub/node/identity';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { desktopComputerIdentity } from '../src/service/computer-identity.js';

const DEVICE_ID = '5b2f6c0e-4a4e-4c1a-9a4e-3d1f0e9b7a11';
const NODE_CONFIG = JSON.stringify({
  role: 'node',
  node: {
    hub_url: 'https://hub.example:8788',
    node_token: `sen_${'a'.repeat(43)}`,
    device_id: DEVICE_ID,
  },
});
const HUB_CONFIG = JSON.stringify({ role: 'hub', go2rtcBinary: '/opt/go2rtc' });
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'computer-identity-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function serviceWith(text: string): Parameters<typeof desktopComputerIdentity>[0] {
  return {
    config: () => Promise.resolve(parseServiceConfigText('test', text)),
    dataDirectory: directory,
  };
}

describe('desktopComputerIdentity', () => {
  it('reports a node computer by its paired device and the id the node itself uses', async () => {
    const identity = await desktopComputerIdentity(serviceWith(NODE_CONFIG));
    expect(identity).toStrictEqual({
      device_id: DEVICE_ID,
      machine_id: await computerMachineId(directory),
    });
    expect(identity.machine_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('keeps the id stable between asks, so a node and the window cannot disagree', async () => {
    const first = await desktopComputerIdentity(serviceWith(NODE_CONFIG));
    const second = await desktopComputerIdentity(serviceWith(NODE_CONFIG));
    expect(second).toStrictEqual(first);
  });

  it('has no device for a computer that runs the home itself', async () => {
    const identity = await desktopComputerIdentity(serviceWith(HUB_CONFIG));
    expect(identity.device_id).toBeNull();
    if (process.platform !== 'linux') {
      expect(identity.machine_id).toBeNull();
      expect(await readdir(directory)).toStrictEqual([]);
    }
  });
});
