import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { NodeAiRuntime } from '../../src/node/ai-runtime';
import type { ComputerControls } from '../../src/node/controls/controls';
import { stubControls, useComputerHub, type Paired } from '../support/paired-computer';
import { call } from '../support/server';
import { until } from '../support/wait';

const APP = { id: 'org.kde.dolphin', name: 'Files', comment: null, icon: null };

const hub = useComputerHub();

function controls(ran: string[]): ComputerControls {
  return stubControls({
    apps: {
      installed: () => Promise.resolve([APP]),
      open: (appId): Promise<void> => {
        ran.push(`open ${appId}`);
        return Promise.resolve();
      },
      close: () => Promise.resolve(0),
    },
  });
}

function runComputer(paired: Paired, ran: string[]): NodeAiRuntime {
  return hub.run(paired, controls(ran));
}

async function appsOf(deviceId: string): Promise<number> {
  const reply = await call(hub.booted().base, hub.booted().owner, {
    method: 'GET',
    path: `/api/computers/${deviceId}/apps`,
  });
  if (reply.status === 200)
    expect(API_ENDPOINTS.listComputerApps.response.parse(reply.body).installed).toEqual([APP]);
  return reply.status;
}

describe('a paired computer', () => {
  it('lists its apps and opens one from the hub over the one node connection', async () => {
    const paired = await hub.pair();
    const ran: string[] = [];
    runComputer(paired, ran);

    await until(async () => (await appsOf(paired.deviceId)) === 200, 'the computer to answer');
    const opened = await call(hub.booted().base, hub.booted().owner, {
      method: 'POST',
      path: `/api/computers/${paired.deviceId}/apps/open`,
      body: { appId: APP.id },
    });

    expect(opened.status).toBe(200);
    expect(ran).toEqual([`open ${APP.id}`]);
  });

  it('changes its volume from a command sent to the hub', async () => {
    const paired = await hub.pair();
    const levels: number[] = [];
    hub.run(paired, {
      ...controls([]),
      session: {
        start: (onChange): Promise<void> => {
          onChange({
            at: '2026-10-17T09:00:00.000Z',
            user: 'dev',
            locked: false,
            focused: null,
            volume: 20,
            muted: false,
            media: null,
          });
          return Promise.resolve();
        },
        stop: () => Promise.resolve(),
        setVolume: (level): Promise<void> => {
          levels.push(level);
          return Promise.resolve();
        },
        setMuted: () => Promise.resolve(),
        playback: () => Promise.resolve(),
      },
    });
    await until(async () => {
      const reply = await call(hub.booted().base, hub.booted().owner, {
        method: 'GET',
        path: '/api/devices',
      });
      const device = API_ENDPOINTS.listDevices.response
        .parse(reply.body)
        .find((entry) => entry.id === paired.deviceId);
      return device?.capabilities.some((capability) => capability.key === 'volume') === true;
    }, 'the computer to report its volume');

    const sent = await call(hub.booted().base, hub.booted().owner, {
      method: 'POST',
      path: '/api/commands',
      body: { device_id: paired.deviceId, capability: 'volume', value: 35 },
    });

    expect(sent.status).toBe(200);
    await until(() => levels.length > 0, 'the volume to change');
    expect(levels).toEqual([35]);
  });

  it('reports its readings to the hub', async () => {
    const paired = await hub.pair();
    runComputer(paired, []);

    await until(async () => {
      const reply = await call(hub.booted().base, hub.booted().owner, {
        method: 'GET',
        path: `/api/computers/${paired.deviceId}`,
      });
      return (
        reply.status === 200 &&
        API_ENDPOINTS.readComputer.response.parse(reply.body).parts.summary?.cpuLoad === 12
      );
    }, 'the computer readings');
  });

  it('tells the signals it went offline when its connection closed and online when it came back', async () => {
    const paired = await hub.pair();
    const online = async (): Promise<unknown> => {
      const reply = await call(hub.booted().base, hub.booted().owner, {
        method: 'GET',
        path: `/api/signals/latest?source=device&kind=online&subject=${paired.deviceId}`,
      });
      return API_ENDPOINTS.readSignal.response.parse(reply.body)[0]?.value;
    };
    const first = runComputer(paired, []);
    await until(async () => (await appsOf(paired.deviceId)) === 200, 'the computer to answer');
    first.stop();
    await until(async () => (await online()) === false, 'the computer to go offline');
    runComputer(paired, []);
    await until(async () => (await online()) === true, 'the computer to come back online');
  });

  it('gives its desktop window an owner credential with the same pairing', async () => {
    const paired = await hub.pair();
    const session = await call(hub.booted().base, paired.windowToken, {
      method: 'GET',
      path: '/api/session',
    });
    expect(API_ENDPOINTS.session.response.parse(session.body).client.role).toBe('owner');
  });

  it('is replaced by pairing it again, and revoking removes both credentials', async () => {
    const first = await hub.pair();
    const second = await hub.pair();

    expect(second.deviceId).toBe(first.deviceId);
    expect(second.token).not.toBe(first.token);
    const old = await call(hub.booted().base, first.windowToken, {
      method: 'GET',
      path: '/api/session',
    });
    expect(old.status).toBe(401);
    const current = await call(hub.booted().base, second.windowToken, {
      method: 'GET',
      path: '/api/session',
    });
    expect(current.status).toBe(200);

    await call(hub.booted().base, hub.booted().owner, {
      method: 'DELETE',
      path: `/api/computers/${second.deviceId}/node`,
    });
    const revoked = await call(hub.booted().base, second.windowToken, {
      method: 'GET',
      path: '/api/session',
    });
    expect(revoked.status).toBe(401);
  });

  it('closes the old pairing’s connection when it is paired again', async () => {
    const first = await hub.pair();
    runComputer(first, []);
    await until(async () => (await appsOf(first.deviceId)) === 200, 'the computer to answer');

    await hub.pair();

    await until(async () => (await appsOf(first.deviceId)) !== 200, 'the old connection to close');
  });

  it('refuses a pairing code for a plain-http hub address that is not this computer', async () => {
    const issued = await call(hub.booted().base, hub.booted().owner, {
      method: 'POST',
      path: '/api/nodes/pairing',
      body: { url: 'http://192.168.1.5:7880' },
    });
    expect(issued.status).toBe(400);
  });
});
