import { API_ENDPOINTS, type AiChatRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

const CHATS = '/api/ai/chats';

async function chatsOf(booted: Booted, token: string, query = ''): Promise<AiChatRow[]> {
  const reply = await call(booted.base, token, { method: 'GET', path: `${CHATS}${query}` });
  return API_ENDPOINTS.listAiChats.response.parse(reply.body);
}

async function titlesOf(booted: Booted, token: string, query = ''): Promise<string[]> {
  return (await chatsOf(booted, token, query)).map((chat) => chat.title);
}

async function started(booted: Booted, token: string, title: string): Promise<AiChatRow> {
  const reply = await call(booted.base, token, { method: 'POST', path: CHATS, body: { title } });
  return API_ENDPOINTS.createAiChat.response.parse(reply.body);
}

async function changed(
  booted: Booted,
  token: string,
  chat: AiChatRow,
  body: Record<string, boolean>,
): Promise<void> {
  const reply = await call(booted.base, token, {
    method: 'PATCH',
    path: `${CHATS}/${chat.id}`,
    body,
  });
  expect(reply.status).toBe(200);
}

async function pairedPerson(booted: Booted): Promise<{ token: string }> {
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
  return phone;
}

describe('clearing the chat history of a profile', () => {
  it('lets a member clear only their own chats, archived ones included', async () => {
    const booted = suite.current;
    await verifiedPublicUrl(booted);
    const member = await pairedPerson(booted);
    const open = await started(booted, member.token, 'Mine open');
    const archived = await started(booted, member.token, 'Mine archived');
    await changed(booted, member.token, archived, { archived: true });
    await started(booted, booted.owner, 'Owner chat');
    expect(await titlesOf(booted, member.token)).toContain(open.title);
    expect(await titlesOf(booted, member.token, '?archived=true')).toEqual([archived.title]);

    const cleared = await call(booted.base, member.token, {
      method: 'DELETE',
      path: `${CHATS}?scope=profile`,
    });

    expect(cleared).toMatchObject({ status: 200, body: { ok: true } });
    expect(await titlesOf(booted, member.token)).toEqual([]);
    expect(await titlesOf(booted, member.token, '?archived=true')).toEqual([]);
    expect(await titlesOf(booted, booted.owner)).toContain('Owner chat');
  });

  it('lets the owner clear their own chats without touching a member’s', async () => {
    const booted = suite.current;
    await verifiedPublicUrl(booted);
    const member = await pairedPerson(booted);
    await started(booted, booted.owner, 'Owner chat');
    await started(booted, member.token, 'Member chat');

    await call(booted.base, booted.owner, { method: 'DELETE', path: `${CHATS}?scope=profile` });

    expect(await titlesOf(booted, booted.owner)).toEqual([]);
    expect(await titlesOf(booted, member.token)).toContain('Member chat');
  });

  it('refuses a delete that does not name the profile scope', async () => {
    const reply = await call(suite.current.base, suite.current.owner, {
      method: 'DELETE',
      path: CHATS,
    });
    expect(reply.status).toBe(400);
  });
});

describe('paging through archived chats', () => {
  async function archivedFive(booted: Booted): Promise<void> {
    const made: AiChatRow[] = [];
    for (const title of ['a', 'b', 'c', 'd', 'e']) {
      made.push(await started(booted, booted.owner, title));
    }
    for (const chat of made) await changed(booted, booted.owner, chat, { archived: true });
    const pinned = made[2];
    if (pinned === undefined) throw new Error('The fixture made fewer than three chats.');
    await changed(booted, booted.owner, pinned, { pinned: true });
  }

  async function walked(booted: Booted, size: number): Promise<AiChatRow[]> {
    const pages: AiChatRow[] = [];
    for (;;) {
      const last = pages.at(-1);
      const after = last === undefined ? '' : `&before=${last.id}`;
      const page = await chatsOf(
        booted,
        booted.owner,
        `?archived=true&limit=${String(size)}${after}`,
      );
      pages.push(...page);
      if (page.length < size) return pages;
    }
  }

  it('returns every archived chat when no page size is given', async () => {
    await archivedFive(suite.current);
    expect(await chatsOf(suite.current, suite.current.owner, '?archived=true')).toHaveLength(5);
  });

  it('walks the whole list in the same order, pinned first, each chat once', async () => {
    const booted = suite.current;
    await archivedFive(booted);
    const whole = await chatsOf(booted, booted.owner, '?archived=true');
    for (const size of [1, 2, 3]) {
      expect((await walked(booted, size)).map((chat) => chat.id)).toEqual(
        whole.map((chat) => chat.id),
      );
    }
    expect(whole[0]?.pinned).toBe(true);
  });

  it('ends with an empty page after the last chat', async () => {
    const booted = suite.current;
    await archivedFive(booted);
    const last = (await chatsOf(booted, booted.owner, '?archived=true')).at(-1);
    expect(last).toBeDefined();
    expect(await chatsOf(booted, booted.owner, `?archived=true&before=${last?.id ?? ''}`)).toEqual(
      [],
    );
  });

  it('refuses a page size below 1', async () => {
    const reply = await call(suite.current.base, suite.current.owner, {
      method: 'GET',
      path: `${CHATS}?archived=true&limit=0`,
    });
    expect(reply.status).toBe(400);
  });

  it('names the problem when the chat to continue after does not exist', async () => {
    const reply = await call(suite.current.base, suite.current.owner, {
      method: 'GET',
      path: `${CHATS}?archived=true&before=11111111-1111-4111-8111-111111111111`,
    });
    expect(reply.status).toBe(404);
  });
});
