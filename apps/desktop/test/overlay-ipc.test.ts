import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_CHANNELS, OVERLAY_LEVELS_PORT_CHANNEL } from '../src/overlay/overlay-messages.js';
import type { OverlayIpcTarget } from '../src/overlay/overlay-ipc.js';

type Handler = (event: unknown, value?: unknown) => void;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
    removeListener: (channel: string): void => {
      handlers.delete(channel);
    },
  },
}));

const { registerOverlayIpc } = await import('../src/overlay/overlay-ipc.js');

class FakePort extends EventEmitter {
  closed = false;
  start(): void {
    this.emit('started');
  }
  close(): void {
    this.closed = true;
    this.emit('close');
  }
}

interface Fake {
  readonly levels: { in: number; out: number; at: number }[];
  readonly readied: number[];
  readonly controller: OverlayIpcTarget;
}

function fake(): Fake {
  const levels: { in: number; out: number; at: number }[] = [];
  const readied: number[] = [];
  const nothing = (): void => undefined;
  const controller: OverlayIpcTarget = {
    levels: (value): void => {
      levels.push(value);
    },
    readyFrom: (id): void => {
      readied.push(id);
    },
    sizeFrom: nothing,
    trayFrom: nothing,
    holdFrom: nothing,
    actFrom: nothing,
    exitedFrom: nothing,
  };
  return { levels, readied, controller };
}

const START = 'app://smarteverything/';

function offer(port: FakePort, url = START): void {
  handlers.get(OVERLAY_LEVELS_PORT_CHANNEL)?.({ senderFrame: { url }, ports: [port] });
}

beforeEach(() => {
  handlers.clear();
});

describe('overlay ipc', () => {
  it('routes the page ready message to the controller with the sender id', () => {
    const { controller, readied } = fake();
    registerOverlayIpc(controller, START);
    handlers.get(OVERLAY_CHANNELS.ready)?.({ sender: { id: 7 } });
    expect(readied).toEqual([7]);
  });

  it('forwards levels from the app port and ends the stream with silence when the port closes', () => {
    const { controller, levels } = fake();
    registerOverlayIpc(controller, START);
    const port = new FakePort();
    offer(port);
    port.emit('message', { data: { in: 0.7, out: 0.1, at: 1234 } });
    port.emit('close');
    expect(levels).toEqual([
      { in: 0.7, out: 0.1, at: 1234 },
      { in: 0, out: 0, at: 1334 },
    ]);
  });

  it('ends the old stream with silence when a new port replaces it', () => {
    const { controller, levels } = fake();
    registerOverlayIpc(controller, START);
    const first = new FakePort();
    offer(first);
    first.emit('message', { data: { in: 0.7, out: 0, at: 10 } });
    offer(new FakePort());
    expect(first.closed).toBe(true);
    expect(levels.at(-1)).toEqual({ in: 0, out: 0, at: 110 });
  });

  it('refuses a port from a page that is not the app', () => {
    const { controller } = fake();
    registerOverlayIpc(controller, START);
    const port = new FakePort();
    offer(port, 'https://example.com/');
    port.emit('message', { data: { in: 1, out: 1, at: 1 } });
    expect(port.listenerCount('message')).toBe(0);
  });
});
