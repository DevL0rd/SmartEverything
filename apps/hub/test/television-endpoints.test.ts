import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from './support/booted';
import { call } from './support/server';

const suite = useBootedServer({ linked: true });

async function devices(): Promise<{ lamp: string; camera: string }> {
  const { base, owner } = suite.current;
  const reply = await call(base, owner, { method: 'GET', path: API_ENDPOINTS.listDevices.path });
  const rows = API_ENDPOINTS.listDevices.response.parse(reply.body);
  const lamp = rows.find((row) => row.kind === 'light')?.id;
  const camera = rows.find((row) => row.kind === 'camera')?.id;
  if (lamp === undefined || camera === undefined) throw new Error('the fake devices are missing');
  return { lamp, camera };
}

async function send(deviceId: string, capability: string, value: unknown): Promise<void> {
  const { base, owner } = suite.current;
  await call(base, owner, {
    method: 'POST',
    path: API_ENDPOINTS.sendCommand.path,
    body: { device_id: deviceId, capability, value },
  });
}

describe('the command list of one device', () => {
  it('keeps only that device’s commands when asked', async () => {
    const { lamp, camera } = await devices();
    await send(lamp, 'power', true);
    await send(camera, 'privacy_mode', true);
    await send(lamp, 'power', false);
    const { base, owner } = suite.current;
    const reply = await call(base, owner, {
      method: 'GET',
      path: `${API_ENDPOINTS.listCommands.path}?deviceId=${lamp}&limit=10`,
    });
    const rows = API_ENDPOINTS.listCommands.response.parse(reply.body);
    expect(rows.map((row) => [row.device_id, row.value])).toEqual([
      [lamp, false],
      [lamp, true],
    ]);
    const all = API_ENDPOINTS.listCommands.response.parse(
      (await call(base, owner, { method: 'GET', path: '/api/commands?limit=10' })).body,
    );
    expect(all.some((row) => row.device_id === camera)).toBe(true);
  });
});

describe('the television discovery endpoint', () => {
  it('belongs to the owner and refuses a device that is not a television', async () => {
    const { lamp } = await devices();
    const { base, owner } = suite.current;
    const path = `/api/televisions/${lamp}/direct/candidates`;
    const refused = await call(base, owner, { method: 'GET', path });
    expect(refused.status).toBe(400);
    await verifiedPublicUrl(suite.current);
    const member = await pairPhone(suite.current, 'member');
    const forbidden = await call(base, member.token, { method: 'GET', path });
    expect(forbidden.status).toBe(403);
  });
});
