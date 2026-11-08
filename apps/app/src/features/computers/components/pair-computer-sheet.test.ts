import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubConnectionMetadata, HubEndpoint } from '@smarteverything/domain';
import { PairComputerSheet, pairingAddresses } from './pair-computer-sheet';

interface Recorded {
  readonly label?: string;
  readonly title?: string;
  readonly value?: unknown;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly options?: readonly { readonly value: string; readonly description?: string }[];
  readonly onChange?: (value: string) => void;
  readonly onPress?: () => void;
  readonly children?: ReactNode;
}

interface Probe {
  current: string | null;
  metadata: unknown;
  readonly calls: { readonly path: string; readonly input: unknown }[];
  readonly fields: Recorded[];
  readonly buttons: Recorded[];
  readonly banners: Recorded[];
  readonly selects: Recorded[];
  readonly texts: unknown[];
}

const probe = vi.hoisted((): Probe => ({
  current: null,
  metadata: null,
  calls: [],
  fields: [],
  buttons: [],
  banners: [],
  selects: [],
  texts: [],
}));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../../../api/transport', () => ({
  useConnection: (): unknown =>
    probe.current === null
      ? { status: 'unpaired', kind: 'desktop', fixedUrl: null }
      : { status: 'paired', kind: 'desktop', connection: { url: probe.current, token: 't' } },
  api: (): unknown => ({
    call: (endpoint: { readonly path: string }, input: unknown): Promise<unknown> => {
      probe.calls.push({ path: endpoint.path, input });
      if (endpoint.path === '/api/connection') return Promise.resolve(probe.metadata);
      return Promise.resolve({
        code: 'ABCD-EFGH',
        url: 'https://hub',
        pin: null,
        expires_at: '2026-11-07T12:00:00Z',
      });
    },
  }),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { settings: { page: (id: string): string => `/settings/${id}` } },
}));
vi.mock('../../../components/sheet', () => ({
  Sheet: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): null => {
    probe.texts.push(children);
    return null;
  },
}));
vi.mock('../../../components/text-field', () => ({
  TextField: (props: Recorded): null => {
    probe.fields.push(props);
    return null;
  },
}));
vi.mock('../../../components/button', () => ({
  Button: (props: Recorded): null => {
    probe.buttons.push(props);
    return null;
  },
}));
vi.mock('../../../components/banner', () => ({
  Banner: (props: Recorded): null => {
    probe.banners.push(props);
    return null;
  },
}));
vi.mock('../../../components/select', () => ({
  Select: (props: Recorded): null => {
    probe.selects.push(props);
    return null;
  },
}));
vi.mock('../../../design/platform', () => ({ desktopBridge: (): null => null }));
vi.mock('../../../store/selectors', () => ({ useIsOwner: (): boolean => true }));
vi.mock('../../../format/locale', () => ({ timeText: (): string => 'noon' }));

const LAN_NAME = 'https://smarteverything-0123456789abcdef0123456789abcdef.local:7443';
const LAN_IP = 'https://192.168.1.20:7443';
const PUBLIC = 'https://home.example.com';
const HEX = 'a'.repeat(64);

function metadata(endpoints: readonly HubEndpoint[]): HubConnectionMetadata {
  return {
    identity: {
      id: HEX,
      protocolVersion: 1,
      name: 'Home',
      tls: {
        serverName: 'smarteverything-0123456789abcdef0123456789abcdef.local',
        certificateSha256: HEX,
        publicKeySha256: HEX,
      },
    },
    endpoints: [...endpoints],
    remoteAvailable: endpoints.some((endpoint) => endpoint.kind === 'remote'),
    discovery: { state: 'advertising', detail: '' },
  };
}

const ALL: readonly HubEndpoint[] = [
  { kind: 'remote', url: PUBLIC },
  { kind: 'lan', url: LAN_NAME },
  { kind: 'lan', url: LAN_IP },
];

describe('pairingAddresses', () => {
  it('suggests the first home network endpoint before the public address', () => {
    expect(pairingAddresses(metadata(ALL), null)).toEqual({
      endpoints: [ALL[1], ALL[2], ALL[0]],
      suggested: LAN_NAME,
    });
  });

  it('keeps the address this window uses when it is one of the hub endpoints', () => {
    expect(pairingAddresses(metadata(ALL), `${LAN_IP}/`).suggested).toBe(LAN_IP);
  });

  it('never suggests a loopback window address', () => {
    expect(pairingAddresses(metadata(ALL), 'http://127.0.0.1:7880').suggested).toBe(LAN_NAME);
  });

  it('falls back to the public address when the hub has no home network endpoint', () => {
    expect(pairingAddresses(metadata([{ kind: 'remote', url: PUBLIC }]), null).suggested).toBe(
      PUBLIC,
    );
  });

  it('suggests nothing when the hub has no https endpoint', () => {
    expect(pairingAddresses(metadata([]), 'http://127.0.0.1:7880')).toEqual({
      endpoints: [],
      suggested: null,
    });
  });
});

let root: Root;
let client: QueryClient;

function last<T>(list: readonly T[]): T {
  const item = list.at(-1);
  if (item === undefined) throw new Error('Expected a rendered element.');
  return item;
}

function generate(): Recorded {
  return last(probe.buttons.filter((button) => button.label === 'Generate service pairing code'));
}

async function settle(): Promise<void> {
  await act(async () => {
    await vi.waitFor(() => {
      expect(client.isFetching() + client.isMutating()).toBe(0);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function mount(): Promise<void> {
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(PairComputerSheet, { open: true, onClose: vi.fn() }),
      ),
    );
  });
  await settle();
}

beforeEach(() => {
  probe.current = null;
  probe.metadata = metadata(ALL);
  probe.calls.length = 0;
  probe.fields.length = 0;
  probe.buttons.length = 0;
  probe.banners.length = 0;
  probe.selects.length = 0;
  probe.texts.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  client.clear();
  vi.unstubAllGlobals();
});

describe('PairComputerSheet', () => {
  it('prefills the hub home network endpoint instead of a loopback window address', async () => {
    probe.current = 'http://127.0.0.1:7880';
    await mount();
    expect(last(probe.fields).value).toBe(LAN_NAME);
    expect(generate().disabled).toBe(false);
    expect(probe.banners).toHaveLength(0);
    expect(last(probe.selects).options?.map((option) => option.description)).toEqual([
      'Home network',
      'Home network',
      'Public address',
    ]);
  });

  it('pairs with the picked hub address', async () => {
    await mount();
    act(() => {
      last(probe.selects).onChange?.(PUBLIC);
    });
    expect(last(probe.fields).value).toBe(PUBLIC);
    act(() => {
      generate().onPress?.();
    });
    await settle();
    expect(probe.calls.at(-1)).toEqual({
      path: '/api/nodes/pairing',
      input: { body: { url: PUBLIC } },
    });
  });

  it('says the hub has no https address and leaves the field empty', async () => {
    probe.current = 'http://127.0.0.1:7880';
    probe.metadata = metadata([]);
    await mount();
    expect(last(probe.banners)).toMatchObject({ title: 'Your hub has no https address' });
    expect(last(probe.fields).value).toBe('');
    expect(generate().disabled).toBe(true);
    expect(probe.selects).toHaveLength(0);
  });

  it('refuses a typed plain http address', async () => {
    await mount();
    act(() => {
      last(probe.fields).onChange?.('http://192.168.1.20:7880');
    });
    expect(last(probe.fields).error).toBe('Use an https:// address');
    expect(generate().disabled).toBe(true);
  });
});
