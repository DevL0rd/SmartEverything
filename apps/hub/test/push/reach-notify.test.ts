import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { call } from '../support/server';
import { usePushBench } from './push-bench';

const bench = usePushBench();

interface Receiver {
  readonly personId: string;
}

async function receiver(token: string): Promise<Receiver> {
  const created = await call(bench.booted.base, bench.booted.owner, {
    method: 'POST',
    path: '/api/profiles',
    body: { name: 'Sam' },
  });
  const personId = API_ENDPOINTS.createProfile.response.parse(created.body).id;
  await call(bench.booted.base, token, {
    method: 'PUT',
    path: API_ENDPOINTS.selectProfile.path,
    body: { profileId: personId },
  });
  return { personId };
}

describe('POST /api/reach/notify to the phone', () => {
  it('shows the notification with the tag and sound and carries the link', async () => {
    await bench.saveAccount();
    const { personId } = await receiver((await bench.registerPhone('fcm-a')).token);
    const sent = await call(bench.booted.base, bench.booted.owner, {
      method: 'POST',
      path: API_ENDPOINTS.notifyPerson.path,
      body: {
        personId,
        text: 'Door open',
        tag: 'door',
        link: '/cameras',
        sound: 'chime',
      },
    });
    expect(sent.status).toBe(200);
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(bench.google.sent[0]?.body).toMatchObject({
      message: {
        token: 'fcm-a',
        notification: { body: 'Door open' },
        data: { link: '/cameras', categoryId: 'assistant_reply' },
        android: { notification: { tag: 'door', sound: 'chime' } },
      },
    });
  });

  it('keeps a plain message a data-only push', async () => {
    await bench.saveAccount();
    const { personId } = await receiver((await bench.registerPhone('fcm-a')).token);
    await call(bench.booted.base, bench.booted.owner, {
      method: 'POST',
      path: API_ENDPOINTS.notifyPerson.path,
      body: { personId, text: 'Hello' },
    });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    const message = JSON.stringify(bench.google.sent[0]?.body);
    expect(message).not.toContain('"notification"');
    expect(message).toContain('"message":"Hello"');
  });
});
