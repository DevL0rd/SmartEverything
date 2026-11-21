import { randomUUID } from 'node:crypto';
import { API_ENDPOINTS, type AiChatRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

const CHATS = '/api/ai/chats';

async function created(booted: Booted, token: string, body: object): Promise<AiChatRow> {
  const reply = await call(booted.base, token, { method: 'POST', path: CHATS, body });
  expect(reply.status).toBe(200);
  return API_ENDPOINTS.createAiChat.response.parse(reply.body);
}

async function chatIds(booted: Booted, token: string): Promise<string[]> {
  const reply = await call(booted.base, token, { method: 'GET', path: CHATS });
  return API_ENDPOINTS.listAiChats.response.parse(reply.body).map((chat) => chat.id);
}

describe('starting a chat with an id the client generated', () => {
  it('keeps the client id and returns the same chat when the create is repeated', async () => {
    const booted = suite.current;
    const id = randomUUID();
    const first = await created(booted, booted.owner, { id, title: 'Planned trip' });
    const again = await created(booted, booted.owner, { id, title: 'Planned trip' });

    expect(first.id).toBe(id);
    expect(again).toMatchObject({ id, title: 'Planned trip' });
    expect((await chatIds(booted, booted.owner)).filter((chatId) => chatId === id)).toHaveLength(1);
  });

  it('refuses a chat id that belongs to someone else', async () => {
    const booted = suite.current;
    await verifiedPublicUrl(booted);
    const id = randomUUID();
    await created(booted, booted.owner, { id, title: 'Owner chat' });
    const person = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/profiles',
      body: { name: 'Sam' },
    });
    const profile = API_ENDPOINTS.createProfile.response.parse(person.body);
    const phone = await pairPhone(booted);
    await call(booted.base, phone.token, {
      method: 'PUT',
      path: '/api/session/profile',
      body: { profileId: profile.id },
    });

    const taken = await call(booted.base, phone.token, {
      method: 'POST',
      path: CHATS,
      body: { id, title: 'Mine' },
    });

    expect(taken.status).toBe(403);
    expect(await chatIds(booted, phone.token)).not.toContain(id);
  });
});
