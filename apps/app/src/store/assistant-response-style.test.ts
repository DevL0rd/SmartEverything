import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ASSISTANT_RESPONSE_STYLE, ASSISTANT_STATUS } from '@smarteverything/domain';
import { EntityStore } from './entity-store';
import { noticeRouter } from './notice-registry';

const hub = { baseUrl: 'http://hub.test', call: vi.fn() };

vi.mock('../api/transport', () => ({ api: (): typeof hub => hub }));
vi.mock('../api/connection/connection', async () => {
  const { ValueStore } = await import('../design/external-store');
  return { connectionState: new ValueStore({ status: 'paired' }), api: (): typeof hub => hub };
});

const { ASSISTANT_STATUS_NOTICE, refreshResponseStyle } =
  await import('./assistant-response-style');

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
