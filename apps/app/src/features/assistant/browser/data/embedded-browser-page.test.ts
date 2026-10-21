import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDED_BROWSER_ACTION_NAMES,
  EMBEDDED_BROWSER_MESSAGE,
  type BrowserPageReading,
  type EmbeddedBrowserScope,
  type NativeBrowserPageRequest,
} from '@smarteverything/domain';

const hub = vi.hoisted(
  (): {
    sockets: unknown[];
    page:
      | { perform: (request: NativeBrowserPageRequest) => Promise<BrowserPageReading | null> }
      | undefined;
    requests: NativeBrowserPageRequest[];
  } => ({ sockets: [], page: undefined, requests: [] }),
);

class FakeSocket {
  readyState = 1;
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    hub.sockets.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('../../../../api/connection/hub-socket', () => ({
  openHubSocket: (): FakeSocket => new FakeSocket(),
}));
vi.mock('../../../../api/connection/active-route', () => ({
  routeFor: (): { readonly state: { readonly subscribe: () => () => void } } => ({
    state: { subscribe: (): (() => void) => () => undefined },
  }),
}));
vi.mock('../browser-page-platform', () => ({
  nativeBrowserPage: (): typeof hub.page => hub.page,
}));

const { EmbeddedBrowserChannel } = await import('./embedded-browser-channel');
const { BrowserTabs } = await import('../browser-tabs');
const { BROWSER_TAB_ID } = await import('../browser-tab-state');

const OWNER: Omit<EmbeddedBrowserScope, 'generation'> = {
  viewerId: '00000000-0000-4000-8000-000000000001',
  clientId: 'client',
  profileId: '00000000-0000-4000-8000-000000000002',
  chatId: '00000000-0000-4000-8000-000000000003',
};
const TAB = BROWSER_TAB_ID.parse('00000000-0000-4000-8000-000000000010');
const READING: BrowserPageReading = {
  generation: 2,
  end: 3,
  title: 'Shop',
  text: 'Welcome',
  textTruncated: false,
  elements: [
    { ref: 'e2', role: 'link', name: 'Cart', value: null, checked: null, disabled: false },
  ],
  elementsTruncated: false,
};

function socketOf(): FakeSocket {
  const socket = hub.sockets.at(-1);
  if (!(socket instanceof FakeSocket)) throw new Error('no socket');
  return socket;
}

function scopeOf(socket: FakeSocket): EmbeddedBrowserScope {
  const message = EMBEDDED_BROWSER_MESSAGE.parse(socket.sent[0]);
  if (message.kind !== 'register') throw new Error('expected a registration');
  return message.scope;
}

async function ask(operation: unknown): Promise<ReturnType<typeof EMBEDDED_BROWSER_MESSAGE.parse>> {
  const socket = socketOf();
  const scope = scopeOf(socket);
  socket.onmessage?.({
    data: JSON.stringify({
      kind: 'perform',
      request: { requestId: globalThis.crypto.randomUUID(), scope, operation },
    }),
  });
  await vi.advanceTimersByTimeAsync(0);
  return EMBEDDED_BROWSER_MESSAGE.parse(socketOf().sent.at(-1));
}

describe('page reading and actions through the channel', () => {
  let channel: InstanceType<typeof EmbeddedBrowserChannel>;
  let revealed: number;
  let tabs: InstanceType<typeof BrowserTabs>;

  beforeEach(() => {
    vi.useFakeTimers();
    hub.sockets.length = 0;
    hub.requests.length = 0;
    hub.page = {
      perform: (request): Promise<BrowserPageReading | null> => {
        hub.requests.push(request);
        return Promise.resolve(request.operation.kind === 'snapshot' ? READING : null);
      },
    };
    revealed = 0;
    tabs = new BrowserTabs(OWNER.chatId, OWNER.profileId);
    tabs.restore({
      selectedId: TAB,
      problem: null,
      tabs: [
        {
          id: TAB,
          title: 'Shop',
          address: 'https://shop.example.com/',
          editing: false,
          status: {
            id: 'public:1',
            url: 'https://shop.example.com/',
            loading: false,
            back: false,
            forward: false,
            problem: null,
          },
          source: { kind: 'public', url: 'https://shop.example.com/' },
          problem: null,
          phase: 'ready',
          selection: {
            kind: 'public',
            target: { kind: 'public', id: 'public:1', url: 'https://shop.example.com/' },
          },
        },
      ],
    });
    channel = new EmbeddedBrowserChannel(
      { url: 'https://hub.test', token: 'token' },
      OWNER,
      tabs,
      () => {
        revealed += 1;
      },
    );
    const socket = socketOf();
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({ kind: 'accepted', scope: scopeOf(socket) }) });
  });

  afterEach(() => {
    channel.dispose();
    vi.useRealTimers();
  });

  it('advertises every action where the device can read and act on pages', async () => {
    const answer = await ask({ kind: 'read' });
    expect(answer).toMatchObject({ kind: 'result', reason: null });
    if (answer.kind !== 'result') throw new Error('expected a result');
    expect(answer.result?.snapshot.capabilities).toEqual([...EMBEDDED_BROWSER_ACTION_NAMES]);
    expect(answer.result?.snapshot.page).toBeUndefined();
  });

  it('leaves the page actions out where the device cannot act on pages', async () => {
    hub.page = undefined;
    const answer = await ask({ kind: 'read' });
    if (answer.kind !== 'result') throw new Error('expected a result');
    expect(answer.result?.snapshot.capabilities).toEqual([
      'open',
      'select',
      'navigate',
      'reload',
      'close',
      'reorder',
    ]);
  });

  it('reads the selected page with its refs and shows the pane', async () => {
    const answer = await ask({ kind: 'read', view: 'page' });
    if (answer.kind !== 'result') throw new Error('expected a result');
    expect(answer.result?.snapshot.page).toMatchObject({
      tabId: TAB,
      generation: 2,
      title: 'Shop',
      address: 'https://shop.example.com/',
    });
    expect(answer.result?.tabId).toBe(TAB);
    expect(revealed).toBe(1);
  });

  it('reports why a page cannot be read', async () => {
    tabs.dispose();
    const none = await ask({ kind: 'read', view: 'page' });
    expect(none).toMatchObject({ kind: 'result', result: null, reason: 'No tab is open.' });
  });

  it('clicks by ref in the page and shows the pane first', async () => {
    const answer = await ask({
      kind: 'edit',
      action: { kind: 'click', tabId: TAB, ref: 'e2' },
    });
    expect(answer).toMatchObject({ kind: 'result', reason: null });
    expect(hub.requests).toEqual([{ id: 'public:1', operation: { kind: 'click', ref: 'e2' } }]);
    expect(revealed).toBe(1);
  });

  it('fails an action on a tab that is closed', async () => {
    const answer = await ask({
      kind: 'edit',
      action: { kind: 'scroll', tabId: '00000000-0000-4000-8000-0000000000ff', dx: 0, dy: 10 },
    });
    expect(answer).toMatchObject({ kind: 'result', result: null });
    expect(hub.requests).toEqual([]);
  });
});
