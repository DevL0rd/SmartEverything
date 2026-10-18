import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call, openLive } from '../support/server';

const suite = useBootedServer({ linked: true });

const CREDENTIALS = {
  provider: 'xiaomi',
  username: 'me@example.com',
  password: 'correct-horse-battery',
  region: 'de',
};

async function linkRow(): Promise<{ status: string; prompt: unknown }> {
  const { base, owner } = suite.current;
  const reply = await call(base, owner, { method: 'GET', path: API_ENDPOINTS.listProviders.path });
  const rows = API_ENDPOINTS.listProviders.response.parse(reply.body);
  const row = rows.find((candidate) => candidate.provider === 'xiaomi');
  if (row === undefined) {
    throw new Error('the xiaomi link row is missing');
  }
  return row;
}

describe('provider linking endpoints', () => {
  it('never writes credentials or answers to the commands table', async () => {
    const { base, owner, fake } = suite.current;
    fake.askDuringLink = true;
    const live = await openLive(base, owner);
    live.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['provider_links'], streams: [] }),
    );
    await live.next((message) => message.type === 'subscribed');
    await call(base, owner, {
      method: 'POST',
      path: API_ENDPOINTS.linkProvider.path,
      body: CREDENTIALS,
    });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'provider_links' &&
        message.record?.prompt !== null &&
        message.record?.prompt !== undefined,
    );
    await call(base, owner, {
      method: 'POST',
      path: API_ENDPOINTS.answerProviderPrompt.path,
      body: { provider: 'xiaomi', answer: '482913' },
    });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'provider_links' &&
        message.record?.status === 'linked' &&
        message.record.prompt === null,
    );
    live.socket.close();
    const commands = await call(base, owner, { method: 'GET', path: '/api/commands?limit=500' });
    const text = JSON.stringify(commands.body);
    expect(text).not.toContain(CREDENTIALS.password);
    expect(text).not.toContain('482913');
    expect(text).not.toContain('hub:link_provider');
    expect(text).not.toContain('hub:answer_prompt');
  });

  it('keeps a working account linked when a sign-in is stopped', async () => {
    const { base, owner, fake } = suite.current;
    fake.askDuringLink = true;
    const live = await openLive(base, owner);
    live.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['provider_links'], streams: [] }),
    );
    await live.next((message) => message.type === 'subscribed');
    await call(base, owner, {
      method: 'POST',
      path: API_ENDPOINTS.linkProvider.path,
      body: CREDENTIALS,
    });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'provider_links' &&
        message.record?.prompt !== null &&
        message.record?.prompt !== undefined,
    );
    const stopped = await call(base, owner, {
      method: 'POST',
      path: API_ENDPOINTS.cancelProviderLink.path,
      body: { provider: 'xiaomi' },
    });
    expect(stopped).toMatchObject({ status: 200, body: { ok: true } });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'provider_links' &&
        message.record?.status === 'linked' &&
        message.record.prompt === null,
    );
    live.socket.close();
    expect(await linkRow()).toMatchObject({ status: 'linked', prompt: null });
    const devices = await call(base, owner, {
      method: 'GET',
      path: API_ENDPOINTS.listDevices.path,
    });
    expect(API_ENDPOINTS.listDevices.response.parse(devices.body).every((d) => d.online)).toBe(
      true,
    );
  });

  it('refuses an answer nobody asked for and bad bodies', async () => {
    const { base, owner } = suite.current;
    const unasked = await call(base, owner, {
      method: 'POST',
      path: API_ENDPOINTS.answerProviderPrompt.path,
      body: { provider: 'xiaomi', answer: '1' },
    });
    expect(unasked).toMatchObject({ status: 409, body: { error: { code: 'conflict' } } });
    const malformed = await call(base, owner, {
      method: 'POST',
      path: API_ENDPOINTS.linkProvider.path,
      body: { provider: 'xiaomi', username: 'me@example.com' },
    });
    expect(malformed).toMatchObject({ status: 400, body: { error: { code: 'invalid_request' } } });
  });

  it('is for the owner only', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const { base } = suite.current;
    for (const [endpoint, body] of [
      [API_ENDPOINTS.linkProvider, CREDENTIALS],
      [API_ENDPOINTS.answerProviderPrompt, { provider: 'xiaomi', answer: '1' }],
      [API_ENDPOINTS.cancelProviderLink, { provider: 'xiaomi' }],
    ] as const) {
      const reply = await call(base, phone.token, { method: 'POST', path: endpoint.path, body });
      expect(reply.status).toBe(403);
    }
  });
});
