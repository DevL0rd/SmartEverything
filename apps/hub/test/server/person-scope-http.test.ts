import {
  API_ENDPOINTS,
  MCP_TOOL_AREAS,
  TEMPLATE_SCOPES,
  type AccessScopes,
  type DeviceRow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call, openLive } from '../support/server';
import { until } from '../support/wait';

const suite = useBootedServer({ linked: true });

const EVERYTHING = TEMPLATE_SCOPES.adult;

async function limit(profileId: string | null, scopes: Partial<AccessScopes>): Promise<void> {
  const changed = await call(suite.current.base, suite.current.owner, {
    method: 'PATCH',
    path: `/api/access/people/${profileId ?? ''}`,
    body: { scopes: { ...EVERYTHING, ...scopes } },
  });
  expect(changed.status).toBe(200);
}

async function placed(
  device: DeviceRow,
  roomName: string,
): Promise<{ device: DeviceRow; room: string }> {
  const { base, owner } = suite.current;
  const room = API_ENDPOINTS.createRoom.response.parse(
    (await call(base, owner, { method: 'POST', path: '/api/rooms', body: { name: roomName } }))
      .body,
  );
  const moved = await call(base, owner, {
    method: 'PATCH',
    path: `/api/devices/${device.id}`,
    body: { room_id: room.id },
  });
  return { device: API_ENDPOINTS.updateDevice.response.parse(moved.body), room: room.id };
}

async function home(): Promise<{ lamp: DeviceRow; camera: DeviceRow; hall: string }> {
  const { base, owner } = suite.current;
  let devices: readonly DeviceRow[] = [];
  await until(async () => {
    devices = API_ENDPOINTS.listDevices.response.parse(
      (await call(base, owner, { method: 'GET', path: '/api/devices' })).body,
    );
    return devices.length >= 2;
  }, 'the linked provider to save its devices');
  const lamp = devices.find((device) => device.name === 'Desk lamp');
  const camera = devices.find((device) => device.name === 'Front door');
  if (lamp === undefined || camera === undefined) {
    throw new Error('the booted home has a lamp and a camera');
  }
  const study = await placed(lamp, 'Study');
  const hall = await placed(camera, 'Hall');
  return { lamp: study.device, camera: hall.device, hall: hall.room };
}

async function member(): Promise<{ token: string; profileId: string; clientId: string }> {
  await verifiedPublicUrl(suite.current);
  const phone = await pairPhone(suite.current);
  if (phone.profileId === null) throw new Error('a paired member phone has a person');
  return { token: phone.token, profileId: phone.profileId, clientId: phone.clientId };
}

function get(token: string, path: string): ReturnType<typeof call> {
  return call(suite.current.base, token, { method: 'GET', path });
}

describe('the areas a person holds', () => {
  it('refuses an app call of an area the person lacks and keeps the calls every app needs', async () => {
    const kid = await member();
    await limit(kid.profileId, {
      areas: MCP_TOOL_AREAS.filter((area) => area !== 'devices' && area !== 'settings'),
    });
    const refused = await get(kid.token, '/api/devices');
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain('Devices is not part of your access');
    expect((await get(kid.token, '/api/rooms')).status).toBe(200);
    expect((await get(kid.token, '/api/session')).status).toBe(200);
    const snapshot = await get(kid.token, '/api/snapshot');
    expect(snapshot.status).toBe(200);
    const tables = API_ENDPOINTS.readSnapshot.response.parse(snapshot.body).tables;
    expect(tables.devices).toStrictEqual([]);
    expect(tables.device_state).toStrictEqual([]);
    expect(tables.rooms).not.toBeUndefined();
    expect((await get(kid.token, '/api/settings')).status).toBe(200);
    expect((await get(suite.current.owner, '/api/devices')).status).toBe(200);
    const audit = await get(suite.current.owner, '/api/access/audit');
    expect(JSON.stringify(audit.body)).toContain('refused_scope');
  });

  it('applies the same limits to an owner phone acting as that person and lifts them on return', async () => {
    const kid = await member();
    await limit(kid.profileId, { areas: ['home'] });
    const owner = await pairPhone(suite.current, 'owner');
    const ownerPerson = owner.profileId ?? '';
    const select = (profileId: string): ReturnType<typeof call> =>
      call(suite.current.base, owner.token, {
        method: 'PUT',
        path: '/api/session/profile',
        body: { profileId },
      });
    expect((await get(owner.token, '/api/devices')).status).toBe(200);
    expect((await select(kid.profileId)).status).toBe(200);
    expect((await get(owner.token, '/api/devices')).status).toBe(403);
    expect((await select(ownerPerson)).status).toBe(200);
    expect((await get(owner.token, '/api/devices')).status).toBe(200);
  });
});

describe('the devices a person may use', () => {
  it('lists, reads and commands only the named devices when the list says only', async () => {
    const kid = await member();
    const { lamp, camera } = await home();
    await limit(kid.profileId, { devices: { mode: 'only', rooms: [], devices: [lamp.id] } });
    const listed = API_ENDPOINTS.listDevices.response.parse(
      (await get(kid.token, '/api/devices')).body,
    );
    expect(listed.map((device) => device.id)).toStrictEqual([lamp.id]);
    const state = API_ENDPOINTS.listState.response.parse(
      (await get(kid.token, '/api/device-state')).body,
    );
    expect(state.every((row) => row.device_id === lamp.id)).toBe(true);
    const snapshot = API_ENDPOINTS.readSnapshot.response.parse(
      (await get(kid.token, '/api/snapshot')).body,
    );
    expect(snapshot.tables.devices.map((device) => device.id)).toStrictEqual([lamp.id]);
    expect(snapshot.tables.cameras).toStrictEqual([]);
    expect((await get(kid.token, `/api/devices/${camera.id}/log`)).status).toBe(403);
    expect((await get(kid.token, `/api/cameras/${camera.id}/snapshot`)).status).toBe(403);
    const refused = await call(suite.current.base, kid.token, {
      method: 'POST',
      path: '/api/commands',
      body: { device_id: camera.id, capability: 'privacy_mode', value: true },
    });
    expect(refused.status).toBe(403);
    const allowed = await call(suite.current.base, kid.token, {
      method: 'POST',
      path: '/api/commands',
      body: { device_id: lamp.id, capability: 'power', value: true },
    });
    expect(allowed.status).toBe(200);
  });

  it('hides a whole room and the devices named when the list says except', async () => {
    const kid = await member();
    const { lamp, camera, hall } = await home();
    await limit(kid.profileId, { devices: { mode: 'except', rooms: [hall], devices: [] } });
    const listed = API_ENDPOINTS.listDevices.response.parse(
      (await get(kid.token, '/api/devices')).body,
    );
    expect(listed.map((device) => device.id)).toContain(lamp.id);
    expect(listed.map((device) => device.id)).not.toContain(camera.id);
    const events = API_ENDPOINTS.listEvents.response.parse(
      (await get(kid.token, '/api/events')).body,
    );
    expect(events.every((event) => event.device_id !== camera.id)).toBe(true);
  });

  it('skips unreachable members of a target and refuses a group or scene that names them', async () => {
    const kid = await member();
    const { lamp, camera, hall } = await home();
    const made = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: '/api/device-groups',
      body: { name: 'Both', device_ids: [lamp.id, camera.id] },
    });
    expect(made.status).toBe(200);
    await limit(kid.profileId, { devices: { mode: 'except', rooms: [hall], devices: [] } });
    const groups = API_ENDPOINTS.listDeviceGroups.response.parse(
      (await get(kid.token, '/api/device-groups')).body,
    );
    expect(groups).toStrictEqual([]);
    const refusedGroup = await call(suite.current.base, kid.token, {
      method: 'POST',
      path: '/api/device-groups',
      body: { name: 'Mine', device_ids: [camera.id] },
    });
    expect(refusedGroup.status).toBe(403);
    const refusedScene = await call(suite.current.base, kid.token, {
      method: 'POST',
      path: '/api/scenes',
      body: {
        name: 'Night',
        icon: 'moon',
        actions: [
          { type: 'command', deviceId: camera.id, capability: 'privacy_mode', value: true },
        ],
      },
    });
    expect(refusedScene.status).toBe(403);
    const target = await call(suite.current.base, kid.token, {
      method: 'POST',
      path: '/api/device-targets/commands',
      body: {
        target: { kind: 'devices', deviceIds: [lamp.id, camera.id] },
        capability: 'power',
        value: true,
      },
    });
    expect(target.status).toBe(200);
    const result = API_ENDPOINTS.sendTargetCommands.response.parse(target.body);
    expect(result.commands.map((command) => command.device_id)).toStrictEqual([lamp.id]);
    expect(result.skipped).toStrictEqual([
      expect.objectContaining({ deviceId: camera.id, reason: 'unsupported' }),
    ]);
  });

  it('keeps a hidden device out of the live feed', async () => {
    const kid = await member();
    const { lamp, camera } = await home();
    await limit(kid.profileId, { devices: { mode: 'only', rooms: [], devices: [lamp.id] } });
    const live = await openLive(suite.current.base, kid.token);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['devices'], streams: [] }));
    await live.next((message) => message.type === 'subscribed');
    for (const device of [camera, lamp]) {
      await call(suite.current.base, suite.current.owner, {
        method: 'PATCH',
        path: `/api/devices/${device.id}`,
        body: { favourite: true },
      });
    }
    const first = await live.next((message) => message.type === 'change');
    expect(first.type === 'change' && first.table === 'devices' ? first.record?.id : null).toBe(
      lamp.id,
    );
    live.socket.close();
  });
});

describe('the walkie-talkie channels a person may use', () => {
  async function channel(name: string): Promise<string> {
    const made = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: '/api/talk/channels',
      body: { name },
    });
    expect(made.status).toBe(200);
    return API_ENDPOINTS.createTalkChannel.response.parse(made.body).id;
  }

  it('shows and joins only the listed channels', async () => {
    const kid = await member();
    const house = await channel('House');
    const garage = await channel('Garage');
    await limit(kid.profileId, { channels: { mode: 'only', ids: [house] } });
    const talk = API_ENDPOINTS.readTalk.response.parse((await get(kid.token, '/api/talk')).body);
    expect(talk.channels.map((row) => row.id)).toStrictEqual([house]);
    const join = (channelId: string): Promise<{ status: number }> =>
      call(suite.current.base, kid.token, {
        method: 'PUT',
        path: `/api/talk/channels/${channelId}/members/client/${kid.clientId}`,
        body: { listening: true },
      });
    expect((await join(garage)).status).toBe(403);
    expect((await join(house)).status).toBe(200);
    const snapshot = API_ENDPOINTS.readSnapshot.response.parse(
      (await get(kid.token, '/api/snapshot?talk=true')).body,
    );
    expect(snapshot.tables.talk_channels?.map((row) => row.id)).toStrictEqual([house]);
    const all = API_ENDPOINTS.readTalk.response.parse(
      (await get(suite.current.owner, '/api/talk')).body,
    );
    expect(all.channels).toHaveLength(2);
  });
});

describe('the models a person may use', () => {
  it('lets a chat start on a listed model and refuses any other', async () => {
    const kid = await member();
    await limit(kid.profileId, { models: { mode: 'only', ids: ['openai/gpt-6'] } });
    const start = (model: string): Promise<{ status: number }> =>
      call(suite.current.base, kid.token, {
        method: 'POST',
        path: '/api/ai/chats',
        body: { engine: { kind: 'openrouter', model, effort: null } },
      });
    expect((await start('openai/gpt-6')).status).toBe(200);
    const refused = await start('google/gemini-3');
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused)).toContain('google/gemini-3');
  });
});

describe('the budget an owner may not carry', () => {
  it('is refused for an owner person and accepted for a member', async () => {
    const kid = await member();
    const budget = { daily_usd: 1, monthly_usd: null, warn_at_percent: 80, hard_stop: true };
    const accepted = await call(suite.current.base, suite.current.owner, {
      method: 'PATCH',
      path: `/api/access/people/${kid.profileId}`,
      body: { budget },
    });
    expect(accepted.status).toBe(200);
    const list = API_ENDPOINTS.listPersonAccess.response.parse(
      (await get(suite.current.owner, '/api/access/people')).body,
    );
    const owner = list.find((access) => access.role === 'owner');
    const refused = await call(suite.current.base, suite.current.owner, {
      method: 'PATCH',
      path: `/api/access/people/${owner?.profile_id ?? ''}`,
      body: { budget },
    });
    expect(refused.status).toBe(409);
  });
});
