import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ValueStore } from '../../design/external-store';

interface RouteFact {
  readonly endpoint: { readonly kind: string } | null;
}

interface Shared {
  readonly connection: ValueStore<{
    readonly status: string;
    readonly connection?: object;
  }>;
  readonly route: ValueStore<RouteFact>;
  readonly home: object;
}

const fake = await vi.hoisted(async (): Promise<Shared> => {
  const { ValueStore } = await import('../../design/external-store');
  return {
    connection: new ValueStore({ status: 'loading' }),
    route: new ValueStore<RouteFact>({ endpoint: { kind: 'lan' } }),
    home: { url: 'https://home' },
  };
});

vi.mock('./connection', () => ({ connectionState: fake.connection }));

vi.mock('./active-route', () => ({
  routeFor: (): { readonly state: Shared['route'] } => ({ state: fake.route }),
}));

const { onLocalNetwork, watchLocalNetwork } = await import('./local-network');

function pair(): void {
  fake.connection.set({ status: 'paired', connection: fake.home });
}

beforeEach(() => {
  fake.route.set({ endpoint: { kind: 'lan' } });
  fake.connection.set({ status: 'loading' });
});

describe('the local network fact', () => {
  it('is true only on a paired connection whose route is the local network', () => {
    expect(onLocalNetwork()).toBe(false);
    pair();
    expect(onLocalNetwork()).toBe(true);
    fake.route.set({ endpoint: { kind: 'public' } });
    expect(onLocalNetwork()).toBe(false);
  });

  it('tells a listener once for each real change and not for the same answer', () => {
    pair();
    const listener = vi.fn();
    const stop = watchLocalNetwork(listener);
    fake.route.set({ endpoint: { kind: 'lan' } });
    expect(listener).not.toHaveBeenCalled();
    fake.route.set({ endpoint: { kind: 'public' } });
    fake.route.set({ endpoint: null });
    expect(listener).toHaveBeenCalledTimes(1);
    fake.route.set({ endpoint: { kind: 'lan' } });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    fake.route.set({ endpoint: { kind: 'public' } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('follows a connection that is paired after it started watching', () => {
    const listener = vi.fn();
    const stop = watchLocalNetwork(listener);
    pair();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});
