import { API_ENDPOINTS, CLIENT_PREFS } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call, openLive } from '../support/server';

const suite = useBootedServer({ linked: false });

function copy(token: string, text: string): ReturnType<typeof call> {
  return call(suite.current.base, token, {
    method: 'PUT',
    path: API_ENDPOINTS.writeSharedClipboard.path,
    body: { text },
  });
}

function paste(token: string): ReturnType<typeof call> {
  return call(suite.current.base, token, {
    method: 'GET',
    path: API_ENDPOINTS.readSharedClipboard.path,
  });
}

async function secondPerson(): Promise<string> {
  const created = await call(suite.current.base, suite.current.owner, {
    method: 'POST',
    path: '/api/profiles',
    body: { name: 'Sam' },
  });
  const profile = API_ENDPOINTS.createProfile.response.parse(created.body);
  const phone = await pairPhone(suite.current);
  await call(suite.current.base, phone.token, {
    method: 'PUT',
    path: API_ENDPOINTS.selectProfile.path,
    body: { profileId: profile.id },
  });
  return phone.token;
}

describe('shared clipboard', () => {
  beforeEach(async () => {
    await verifiedPublicUrl(suite.current);
  });

  it('shows nothing before anyone copied', async () => {
    expect((await paste(suite.current.owner)).body).toBeNull();
  });

  it('gives text copied on one device to the person’s other devices', async () => {
    const phone = await pairPhone(suite.current, 'owner');
    const written = await copy(phone.token, 'tracking code 1Z999');
    expect(written.status).toBe(200);
    expect(written.body).toMatchObject({ text: 'tracking code 1Z999', from: phone.clientId });
    expect((await paste(suite.current.owner)).body).toMatchObject({
      text: 'tracking code 1Z999',
      from: phone.clientId,
    });
  });

  it('keeps only the latest copy', async () => {
    await copy(suite.current.owner, 'first');
    await copy(suite.current.owner, 'second');
    expect((await paste(suite.current.owner)).body).toMatchObject({ text: 'second' });
  });

  it('tells the person’s connected devices at once, and nobody else’s', async () => {
    const phone = await pairPhone(suite.current, 'owner');
    const own = await openLive(suite.current.base, suite.current.owner);
    const samToken = await secondPerson();
    const other = await openLive(suite.current.base, samToken);
    await copy(phone.token, 'for my laptop');
    expect(await own.next((message) => message.type === 'clipboard')).toMatchObject({
      type: 'clipboard',
      text: 'for my laptop',
      from: phone.clientId,
    });
    await copy(samToken, 'for sam');
    expect(await other.next((message) => message.type === 'clipboard')).toMatchObject({
      text: 'for sam',
    });
    own.socket.close();
    other.socket.close();
  });

  it('keeps each person’s clipboard apart', async () => {
    const sam = await secondPerson();
    await copy(suite.current.owner, 'mine');
    expect((await paste(sam)).body).toBeNull();
    await copy(sam, 'sam’s');
    expect((await paste(suite.current.owner)).body).toMatchObject({ text: 'mine' });
  });

  it('refuses to share while the person has turned it off', async () => {
    const { storageKey } = CLIENT_PREFS.shared_clipboard;
    await call(suite.current.base, suite.current.owner, {
      method: 'PUT',
      path: `/api/layouts/${storageKey}`,
      body: { layout: CLIENT_PREFS.shared_clipboard.encode({ enabled: false }) },
    });
    const refused = await copy(suite.current.owner, 'secret');
    expect(refused.status).toBe(409);
    expect((await paste(suite.current.owner)).status).toBe(409);
  });

  it('refuses an empty copy', async () => {
    expect((await copy(suite.current.owner, '')).status).toBe(400);
  });
});
