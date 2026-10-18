import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PHONE_DETAIL, PHONE_DETAIL_NOTICE, type PhoneDetail } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const served = vi.hoisted((): { detail: unknown; reads: number } => ({ detail: {}, reads: 0 }));

vi.mock('../../../api/transport', () => ({
  api: (): { call: () => Promise<unknown> } => ({
    call: (): Promise<unknown> => {
      served.reads += 1;
      return Promise.resolve(served.detail);
    },
  }),
}));

import {
  phoneDetailKey,
  receivePhoneDetail,
  usePhoneDetail,
  usePhoneSection,
} from './phone-detail';

const PHONE = '00000000-0000-4000-8000-0000000000a1';
const EARLIER = '2026-10-18T09:00:00Z';
const LATER = '2026-10-18T09:00:05Z';
const roots: ReturnType<typeof createRoot>[] = [];

function detail(): PhoneDetail {
  return PHONE_DETAIL.parse({
    alarm: { nextAt: null, appLabel: null, at: EARLIER },
    notifications: { count: 2, apps: [], items: null, at: EARLIER },
  });
}

function settled(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function mount(client: QueryClient, ...parts: (() => void)[]): void {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  roots.push(root);
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        ...parts.map((part, index) =>
          createElement(
            (): ReactNode => {
              part();
              return null;
            },
            { key: index },
          ),
        ),
      ),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  served.reads = 0;
  vi.unstubAllGlobals();
});

describe('phone detail hooks', () => {
  it('re-renders only the card whose section a notice changed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(phoneDetailKey(PHONE), detail());
    const renders = { alarm: 0, notifications: 0 };
    mount(
      client,
      () => {
        usePhoneSection(PHONE, 'alarm');
        renders.alarm += 1;
      },
      () => {
        usePhoneSection(PHONE, 'notifications');
        renders.notifications += 1;
      },
    );
    await act(settled);
    const before = { ...renders };
    act(() => {
      receivePhoneDetail(
        client,
        PHONE_DETAIL_NOTICE.parse({
          type: 'phone_detail',
          deviceId: PHONE,
          parts: { alarm: { nextAt: '2026-10-19T06:30:00Z', appLabel: 'Clock', at: LATER } },
        }),
      );
    });
    await act(settled);
    expect(renders.alarm).toBeGreaterThan(before.alarm);
    expect(renders.notifications).toBe(before.notifications);
  });

  it('reads the hub once for every card that is open, and again when the page opens', async () => {
    served.detail = detail();
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    mount(
      client,
      () => usePhoneSection(PHONE, 'alarm'),
      () => usePhoneSection(PHONE, 'notifications'),
    );
    await act(settled);
    expect(served.reads).toBe(1);
    mount(client, () => usePhoneDetail(PHONE));
    await act(settled);
    expect(served.reads).toBe(2);
    expect(client.getQueryData(phoneDetailKey(PHONE))).toEqual(detail());
  });
});
