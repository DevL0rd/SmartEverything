import {
  API_ENDPOINTS,
  TILING_STATE,
  type ComputerFeature,
  type TilingChange,
  type TilingState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TilingControl } from '../../src/node/controls/session-controls';
import { callTool, structured } from '../mcp/client';
import { verifiedPublicUrl } from '../support/booted';
import { guestMember, stubControls, useComputerHub, type Paired } from '../support/paired-computer';
import { call } from '../support/server';
import { until } from '../support/wait';

const hub = useComputerHub();

const LAYOUT: TilingState = {
  overviewOpen: false,
  outputs: [{ name: 'DP-1', width: 2560, height: 1440 }],
  workspaces: [
    {
      id: 1,
      index: 1,
      name: 'code',
      output: 'DP-1',
      active: true,
      focused: true,
      urgent: false,
      activeWindowId: 7,
      columns: [{ display: 'normal', windowIds: [7] }],
    },
  ],
  windows: [
    {
      id: 7,
      title: 'main.ts',
      appId: 'org.kde.kate',
      workspaceId: 1,
      focused: true,
      floating: false,
      urgent: false,
    },
  ],
};

interface Konveyor {
  readonly control: TilingControl;
  readonly changes: TilingChange[];
  readonly arrive: (running: boolean) => void;
}

function konveyor(): Konveyor {
  const changes: TilingChange[] = [];
  let features: readonly ComputerFeature[] = ['tiling'];
  let announce = (): void => undefined;
  let layout = LAYOUT;
  const control: TilingControl = {
    features: () => Promise.resolve(features),
    read: () => Promise.resolve(layout),
    change: (change) => {
      changes.push(change);
      layout = { ...layout, overviewOpen: !layout.overviewOpen };
      return Promise.resolve(layout);
    },
    watch: () => () => undefined,
    watchPresence: (listener) => {
      announce = listener;
      return () => undefined;
    },
    stop: () => Promise.resolve(),
  };
  return {
    control,
    changes,
    arrive: (running): void => {
      features = running ? ['tiling'] : [];
      announce();
    },
  };
}

let paired: Paired;
let desktop: Konveyor;

function route(token: string, method: 'GET' | 'POST', body?: unknown): ReturnType<typeof call> {
  return call(hub.booted().base, token, {
    method,
    path: `/api/computers/${paired.deviceId}/tiling`,
    ...(body === undefined ? {} : { body }),
  });
}

async function featuresOf(): Promise<readonly string[]> {
  const reply = await call(hub.booted().base, hub.booted().owner, {
    method: 'GET',
    path: `/api/computers/${paired.deviceId}`,
  });
  return API_ENDPOINTS.readComputer.response.parse(reply.body).features;
}

beforeEach(async () => {
  desktop = konveyor();
  paired = await hub.pair();
  hub.run(paired, stubControls({ tiling: desktop.control }));
  await until(async () => (await featuresOf()).includes('tiling'), 'the computer with tiling');
});

describe('tiling through the hub', () => {
  it('reads the layout Konveyor reports', async () => {
    const reply = await route(hub.booted().owner, 'GET');
    expect(reply.status).toBe(200);
    expect(TILING_STATE.parse(reply.body)).toEqual(LAYOUT);
  });

  it('sends an allowed change to the computer and answers the layout afterwards', async () => {
    const reply = await route(hub.booted().owner, 'POST', { action: 'toggle-overview' });
    expect(reply.status).toBe(200);
    expect(TILING_STATE.parse(reply.body).overviewOpen).toBe(true);
    expect(desktop.changes).toEqual([{ action: 'toggle-overview' }]);
  });

  it('refuses a change that is not on the list before it reaches the computer', async () => {
    const refused = [
      { action: 'load_config_file', path: '/etc/passwd' },
      { action: 'toggle-overview', arguments: ['x'] },
      { name: 'spawn', arguments: ['sh'] },
    ];
    for (const body of refused) {
      expect((await route(hub.booted().owner, 'POST', body)).status).toBe(400);
    }
    expect(desktop.changes).toEqual([]);
  });

  it('keeps it away from a person who was not given the computer', async () => {
    const member = await guestMember(hub.booted());
    expect((await route(member, 'GET')).status).toBe(404);
    expect((await route(member, 'POST', { action: 'center-column' })).status).toBe(404);
    expect(desktop.changes).toEqual([]);
  });

  it('adds and withdraws the tiling feature as Konveyor starts and stops', async () => {
    desktop.arrive(false);
    await until(async () => !(await featuresOf()).includes('tiling'), 'tiling to be withdrawn');
    desktop.arrive(true);
    await until(async () => (await featuresOf()).includes('tiling'), 'tiling to come back');
  });
});

describe('tiling for an AI', () => {
  let token: string;

  beforeEach(async () => {
    await verifiedPublicUrl(hub.booted());
    const created = await call(hub.booted().base, hub.booted().owner, {
      method: 'POST',
      path: '/api/mcp/tokens',
      body: { name: 'Assistant' },
    });
    token = API_ENDPOINTS.createMcpToken.response.parse(created.body).token;
  });

  afterEach(() => {
    desktop.changes.length = 0;
  });

  it('reads it as a view of computer_read', async () => {
    const result = await callTool(hub.booted().base, token, 'computer_read', {
      view: 'tiling',
      deviceId: paired.deviceId,
    });
    expect(result.isError).toBe(false);
    expect(JSON.stringify(structured(result))).toContain('main.ts');
  });

  it('changes it with operation_call and gets the layout back', async () => {
    const result = await callTool(hub.booted().base, token, 'operation_call', {
      operation: 'changeComputerTiling',
      arguments: { deviceId: paired.deviceId, body: { action: 'center-column' } },
    });
    expect(result.isError).toBe(false);
    expect(desktop.changes).toEqual([{ action: 'center-column' }]);
  });

  it('is refused a change that is not on the list', async () => {
    const result = await callTool(hub.booted().base, token, 'operation_call', {
      operation: 'changeComputerTiling',
      arguments: { deviceId: paired.deviceId, body: { action: 'load_config_file', path: '/x' } },
    });
    expect(result.isError).toBe(true);
    expect(desktop.changes).toEqual([]);
  });
});
