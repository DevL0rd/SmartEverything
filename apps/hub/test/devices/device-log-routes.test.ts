import { API_ENDPOINTS, type DeviceLogEntry } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LAMP } from '../support/fake-provider';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call } from '../support/server';
import { until } from '../support/wait';

const suite = useBootedServer({ linked: true });

async function lampId(token: string): Promise<string> {
  const { base } = suite.current;
  const devices = API_ENDPOINTS.listDevices.response.parse(
    (await call(base, token, { method: 'GET', path: '/api/devices' })).body,
  );
  const lamp = devices.find((device) => device.external_id === LAMP.externalId);
  if (lamp === undefined) throw new Error('The lamp was not discovered.');
  return lamp.id;
}

describe('the device log over HTTP', () => {
  it('shows a member who turned the lamp on, by name, once the lamp confirms it', async () => {
    const { base, fake } = suite.current;
    await verifiedPublicUrl(suite.current);
    const person = API_ENDPOINTS.createProfile.response.parse(
      (
        await call(base, suite.current.owner, {
          method: 'POST',
          path: '/api/profiles',
          body: { name: 'Dana' },
        })
      ).body,
    );
    const phone = await pairPhone(suite.current, 'member', person.id);
    const id = await lampId(phone.token);
    const sink = fake.adapter.sink;
    if (sink === null) throw new Error('The fake provider has no sink.');
    sink.state({
      externalId: LAMP.externalId,
      capability: 'power',
      value: false,
      observedAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const sent = await call(base, phone.token, {
      method: 'POST',
      path: '/api/commands',
      body: { device_id: id, capability: 'power', value: true },
    });
    expect(sent.status).toBe(200);
    sink.state({
      externalId: LAMP.externalId,
      capability: 'power',
      value: true,
      observedAt: new Date().toISOString(),
    });
    const entries = async (): Promise<DeviceLogEntry[]> =>
      API_ENDPOINTS.readDeviceLog.response.parse(
        (await call(base, phone.token, { method: 'GET', path: `/api/devices/${id}/log` })).body,
      );
    await until(async () => (await entries()).length === 1, 'the lamp change in the log');
    expect(await entries()).toMatchObject([
      { kind: 'change', title: 'Turned on', cause: { kind: 'app', name: 'Dana' } },
    ]);
  });

  it('refuses to press a lamp and says what it is not', async () => {
    const { base } = suite.current;
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const reply = await call(base, phone.token, {
      method: 'POST',
      path: `/api/devices/${await lampId(phone.token)}/press`,
      body: { action: 'single_press' },
    });
    expect(reply).toMatchObject({
      status: 400,
      body: { error: { code: 'invalid_request' } },
    });
  });

  it('answers 404 for a device that does not exist', async () => {
    const { base, owner } = suite.current;
    const reply = await call(base, owner, {
      method: 'GET',
      path: '/api/devices/0d000000-0000-4000-8000-000000000001/log',
    });
    expect(reply.status).toBe(404);
  });
});
