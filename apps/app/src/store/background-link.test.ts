import type { LiveMessage } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundLink, type BackgroundLinkPorts } from './background-link';
import { TOKEN_WITHDRAWN, backoffOf, type SocketHandlers, type SocketTarget } from './live-socket';

const NOTIFICATION = {
  type: 'notification',
  requestId: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73',
  id: 'eventId=1&kind=doorbell',
  title: 'Doorbell',
  body: 'Someone is at the door',
  data: { eventId: '1', kind: 'doorbell' },
} as const satisfies LiveMessage;

const COMMAND = {
  type: 'push_command',
  command: 'phone_action',
  payload: { requestId: 'r1' },
} as const satisfies LiveMessage;

const CLIPBOARD = {
  type: 'clipboard',
  text: 'hello',
  from: '3f0a1d52-6a37-4c0e-9d3c-8a1c5f7e2b10',
  at: '2026-10-18T10:00:00.000Z',
} as const satisfies LiveMessage;

interface Opened {
  readonly target: SocketTarget;
  readonly handlers: SocketHandlers;
  closed: boolean;
}

function rig(failures = 0): {
  readonly link: BackgroundLink;
  readonly opened: Opened[];
  readonly ports: { [K in keyof BackgroundLinkPorts]: ReturnType<typeof vi.fn> };
} {
  const opened: Opened[] = [];
  let remaining = failures;
  const ports = {
    open: vi.fn((target: SocketTarget, handlers: SocketHandlers): (() => void) => {
      if (remaining > 0) {
        remaining -= 1;
        throw new Error('the route is not ready');
      }
      const entry: Opened = { target, handlers, closed: false };
      opened.push(entry);
      return (): void => {
        entry.closed = true;
      };
    }),
    notification: vi.fn(),
    pushCommand: vi.fn(),
    refused: vi.fn(),
  };
  return {
    link: new BackgroundLink({ url: 'http://hub.test:7880', token: 'token' }, ports),
    opened,
    ports,
  };
}

function lastOpened(opened: readonly Opened[]): Opened {
  const entry = opened.at(-1);
  if (entry === undefined) throw new Error('no socket was opened');
  return entry;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the connection that carries alerts while the app is in the background', () => {
  it('asks the hub for no tables and no streams, and says the app is in the background', () => {
    const { link, opened } = rig();
    link.start();
    expect(opened).toHaveLength(1);
    expect(lastOpened(opened).target).toEqual({
      url: 'http://hub.test:7880',
      token: 'token',
      subscribe: { type: 'subscribe', tables: [], streams: [], background: true },
    });
  });

  it('opens one connection however often it is started', () => {
    const { link, opened } = rig();
    link.start();
    link.start();
    expect(opened).toHaveLength(1);
  });

  it('hands notifications and push commands on, and ignores every other notice', () => {
    const { link, opened, ports } = rig();
    link.start();
    const { handlers } = lastOpened(opened);
    handlers.onMessage({ kind: 'message', message: NOTIFICATION });
    handlers.onMessage({ kind: 'message', message: COMMAND });
    handlers.onMessage({ kind: 'message', message: CLIPBOARD });
    handlers.onMessage({ kind: 'unreadable', reason: 'not json', table: null });
    expect(ports.notification).toHaveBeenCalledExactlyOnceWith(NOTIFICATION);
    expect(ports.pushCommand).toHaveBeenCalledExactlyOnceWith(COMMAND);
  });

  it('closes its connection when stopped and hears nothing from it afterwards', () => {
    const { link, opened, ports } = rig();
    link.start();
    const { handlers } = lastOpened(opened);
    link.stop();
    expect(lastOpened(opened).closed).toBe(true);
    handlers.onMessage({ kind: 'message', message: NOTIFICATION });
    handlers.onClose(1006, 'late');
    vi.advanceTimersByTime(60_000);
    expect(ports.notification).not.toHaveBeenCalled();
    expect(opened).toHaveLength(1);
  });

  it('starts again after being stopped', () => {
    const { link, opened } = rig();
    link.start();
    link.stop();
    link.start();
    expect(opened).toHaveLength(2);
    expect(lastOpened(opened).closed).toBe(false);
  });

  it('opens a new connection after the old one drops, waiting longer after each failure', () => {
    const { link, opened } = rig();
    link.start();
    lastOpened(opened).handlers.onClose(1006, 'gone');
    vi.advanceTimersByTime(backoffOf(0) - 1);
    expect(opened).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(opened).toHaveLength(2);
    lastOpened(opened).handlers.onClose(1006, 'gone again');
    vi.advanceTimersByTime(backoffOf(1) - 1);
    expect(opened).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(opened).toHaveLength(3);
  });

  it('waits the shortest time again once a connection has opened', () => {
    const { link, opened } = rig();
    link.start();
    lastOpened(opened).handlers.onClose(1006, 'gone');
    vi.advanceTimersByTime(backoffOf(0));
    lastOpened(opened).handlers.onOpen(vi.fn());
    lastOpened(opened).handlers.onClose(1006, 'gone');
    vi.advanceTimersByTime(backoffOf(0));
    expect(opened).toHaveLength(3);
  });

  it('retries a connection that could not be opened', () => {
    const { link, opened, ports } = rig(1);
    link.start();
    expect(ports.open).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(0);
    vi.advanceTimersByTime(backoffOf(0));
    expect(opened).toHaveLength(1);
  });

  it('retries at once when the network comes back, and not when nothing is waiting', () => {
    const { link, opened } = rig();
    link.start();
    link.online();
    expect(opened).toHaveLength(1);
    lastOpened(opened).handlers.onClose(1006, 'gone');
    link.online();
    expect(opened).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(opened).toHaveLength(2);
  });

  it('gives up and reports the refusal when the hub no longer accepts the phone', () => {
    const { link, opened, ports } = rig();
    link.start();
    lastOpened(opened).handlers.onClose(TOKEN_WITHDRAWN, 'withdrawn');
    vi.advanceTimersByTime(60_000);
    expect(ports.refused).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(1);
  });
});
