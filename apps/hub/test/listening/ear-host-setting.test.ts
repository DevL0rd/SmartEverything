import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { linkFakeProvider } from '../support/booted';
import { useComputerHub } from '../support/paired-computer';
import { call } from '../support/server';

const hub = useComputerHub();

async function patch(body: unknown): Promise<{ status: number; body: unknown }> {
  const booted = hub.booted();
  return call(booted.base, booted.owner, {
    method: 'PATCH',
    path: '/api/settings/listening',
    body,
  });
}

async function lampId(): Promise<string | undefined> {
  const booted = hub.booted();
  const reply = await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' });
  return E.listDevices.response.parse(reply.body).find((device) => device.kind !== 'computer')?.id;
}

describe('choosing the computer that listens', () => {
  it('starts with no choice', async () => {
    const booted = hub.booted();
    const reply = await call(booted.base, booted.owner, { method: 'GET', path: '/api/settings' });
    expect(E.readSettings.response.parse(reply.body).ear_host_device_id).toBeNull();
  });

  it('saves a computer and clears it again', async () => {
    const { deviceId } = await hub.pair();
    const saved = await patch({ ear_host_device_id: deviceId });
    expect(saved.status).toBe(200);
    expect(E.updateListeningSettings.response.parse(saved.body).ear_host_device_id).toBe(deviceId);
    const cleared = await patch({ ear_host_device_id: null });
    expect(E.updateListeningSettings.response.parse(cleared.body).ear_host_device_id).toBeNull();
  });

  it('refuses a device that is not a computer and one that does not exist', async () => {
    await linkFakeProvider(hub.booted());
    const lamp = await lampId();
    expect(lamp).toBeDefined();
    expect((await patch({ ear_host_device_id: lamp })).status).toBe(404);
    expect((await patch({ ear_host_device_id: crypto.randomUUID() })).status).toBe(404);
  });

  it('changes the pause alone without touching the choice', async () => {
    const { deviceId } = await hub.pair();
    await patch({ ear_host_device_id: deviceId });
    const reply = await patch({ end_of_speech_pause_ms: 640 });
    expect(E.updateListeningSettings.response.parse(reply.body)).toMatchObject({
      end_of_speech_pause_ms: 640,
      ear_host_device_id: deviceId,
    });
  });

  it('refuses a change that names nothing', async () => {
    expect((await patch({})).status).toBe(400);
  });
});
