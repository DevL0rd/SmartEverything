import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ASSISTANT_RESPONSE_STYLE, ASSISTANT_STATUS, SESSION } from '@smarteverything/domain';
import { EntityStore } from './entity-store';
import { noticeRouter } from './notice-registry';

const hub = { baseUrl: 'http://hub.test', call: vi.fn() };

vi.mock('../api/transport', () => ({ api: (): typeof hub => hub }));
vi.mock('../api/connection/connection', async () => {
  const { ValueStore } = await import('../design/external-store');
  return { connectionState: new ValueStore({ status: 'paired' }), api: (): typeof hub => hub };
});

const {
  ASSISTANT_STATUS_NOTICE,
  refreshResponseStyle,
  captureAssistantWrite,
  assertAssistantWriteCurrent,
} = await import('./assistant-response-style');

const STYLE = ASSISTANT_RESPONSE_STYLE.parse({});
const STATUS = ASSISTANT_STATUS.parse({ settings: {} });

function storeWith(status: typeof STATUS): EntityStore {
  const store = new EntityStore();
  store.update((state) => ({ ...state, assistant: status }));
  return store;
}

async function settled(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('assistant status notice', () => {
  it('rereads the response style and merges it into the new status', async () => {
    hub.call.mockResolvedValue(STYLE);
    const store = storeWith(STATUS);
    const route = noticeRouter([ASSISTANT_STATUS_NOTICE], { client: new QueryClient(), store });
    route({ type: 'assistant_status', status: STATUS }, true);
    await settled();
    expect(hub.call).toHaveBeenCalledTimes(1);
    expect(store.get().assistant?.settings.response_style).toStrictEqual(STYLE);
  });

  it('removes the style when the read fails', async () => {
    hub.call.mockRejectedValue(new Error('offline'));
    const store = storeWith(ASSISTANT_STATUS.parse({ settings: { response_style: STYLE } }));
    await refreshResponseStyle(new QueryClient(), store);
    expect(store.get().assistant?.settings.response_style).toBeUndefined();
  });
});

const SESSION_ROW = SESSION.parse({
  client: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
});

describe('assistant write authority', () => {
  function signedIn(): EntityStore {
    const store = new EntityStore();
    store.update((state) => ({ ...state, session: SESSION_ROW }));
    return store;
  }

  it('accepts metadata changes to the same authenticated client', () => {
    const store = signedIn();
    const scope = captureAssistantWrite(store);
    store.update((state) => ({
      ...state,
      session: {
        ...SESSION_ROW,
        client: {
          ...SESSION_ROW.client,
          name: 'Renamed',
          last_seen_at: '2026-11-07T23:18:17.325Z',
        },
      },
    }));
    expect(scope.current()).toBe(true);
    expect(() => {
      assertAssistantWriteCurrent(scope);
    }).not.toThrow();
  });

  it.each([
    { id: '00000000-0000-4000-8000-000000000003' },
    { profile_id: '00000000-0000-4000-8000-000000000003' },
    { role: 'member' as const },
    { built_in: true },
  ])('rejects changed client authority %j', (change) => {
    const store = signedIn();
    const scope = captureAssistantWrite(store);
    store.update((state) => ({
      ...state,
      session: {
        ...SESSION_ROW,
        client: { ...SESSION_ROW.client, ...change },
      },
    }));
    expect(scope.current()).toBe(false);
    expect(() => {
      assertAssistantWriteCurrent(scope);
    }).toThrow();
  });

  it('rejects signout and changed connection trust', async () => {
    const { connectionState } = await import('../api/connection/connection');
    const store = signedIn();
    const scope = captureAssistantWrite(store);
    store.update((state) => ({ ...state, session: null }));
    expect(scope.current()).toBe(false);
    const paired = signedIn();
    const trusted = captureAssistantWrite(paired);
    connectionState.set({ ...connectionState.get() });
    expect(trusted.current()).toBe(false);
  });
});
