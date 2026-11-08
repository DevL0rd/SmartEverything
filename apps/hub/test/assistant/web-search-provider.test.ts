import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { homeSearchProvider } from '../../src/assistant/web-search-supplier';
import type { AiModelRoute } from '@smarteverything/domain';
import type { AuxCompletionRequest } from '@smarteverything/harness/process';
import { useRig } from './harness/support/rig';
import type { Rig } from './harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

async function openSession(): Promise<string> {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  return open.claim.session_id;
}

function provider(): ReturnType<typeof homeSearchProvider> {
  return homeSearchProvider(rig.service, () =>
    Promise.reject(new Error('The test must not reach the supplier.')),
  );
}

function openRouterRoute(): AiModelRoute {
  const base = rig.service.routes
    .list(rig.owner.profileId)
    .find((route) => route.id === rig.route.route_id);
  if (base === undefined) throw new Error('The test route is missing.');
  return {
    ...base,
    id: randomUUID(),
    auth: { provider: 'openrouter', kind: 'hub-api-key' },
    billing: 'metered',
  };
}

async function openOpenRouterSession(effort: string | null): Promise<{
  readonly sessionId: string;
  readonly route: AiModelRoute;
}> {
  const route = openRouterRoute();
  rig.service.routes.publish(route);
  const chat = rig.opened.store.aiChats.create({
    profileId: rig.owner.profileId,
    kind: 'chat',
    title: 'Search chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: {
      kind: 'dsh',
      execution_target: rig.hub.target,
      session_id: null,
      model_route_id: route.id,
      model: 'model-a',
      effort,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    },
  });
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  return { sessionId: open.claim.session_id, route };
}

describe('the home web search provider', () => {
  it('asks the chat’s own OpenRouter model through the completion port and returns the answer', async () => {
    const { sessionId, route } = await openOpenRouterSession(null);
    const seen: AuxCompletionRequest[] = [];
    const search = homeSearchProvider(rig.service, (request) => {
      seen.push(request);
      return Promise.resolve('It is sunny.');
    });

    expect(search.offered(sessionId)).toBe(true);
    const answer = await search.search({ sessionId, query: 'weather today' });

    expect(answer).toEqual({ content: 'It is sunny.', sources: [], truncated: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      provider: route.id,
      model: 'model-a',
      sessionId,
      input: 'weather today',
      effort: null,
    });
    expect(seen[0]?.system).toContain('web search query');
  });

  it('is not offered to a chat on a subscription route', async () => {
    const sessionId = await openSession();

    expect(provider().offered(sessionId)).toBe(false);
  });

  it('refuses a search from a chat on a subscription route before any request', async () => {
    const sessionId = await openSession();

    const search = provider().search({ sessionId, query: 'weather' });

    await expect(search).rejects.toMatchObject({ code: 'forbidden' });
    await expect(search).rejects.toThrow('OpenRouter model');
  });

  it('refuses a session that has no conversation grant', async () => {
    await expect(
      provider().search({ sessionId: randomUUID(), query: 'weather' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
