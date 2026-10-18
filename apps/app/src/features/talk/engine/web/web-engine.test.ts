import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TalkClientMessage, TalkServerMessage } from '@smarteverything/domain';
import { IDLE_TRANSMIT, engineState } from '../engine-state';
import type { TalkSocket, TalkSocketHandlers } from './talk-socket';

interface OpenedSocket {
  readonly handlers: TalkSocketHandlers;
  readonly sent: TalkClientMessage[];
  closed: boolean;
}

const sockets = vi.hoisted((): { readonly opened: OpenedSocket[] } => ({ opened: [] }));
const capture = vi.hoisted(() => ({
  open: vi.fn(),
  stop: vi.fn(),
}));
const tones = vi.hoisted((): { readonly played: string[] } => ({ played: [] }));

vi.mock('./talk-socket', () => ({
  openTalkSocket: (_connection: unknown, handlers: TalkSocketHandlers): TalkSocket => {
    const socket: OpenedSocket = { handlers, sent: [], closed: false };
    sockets.opened.push(socket);
    return {
      send: (message: TalkClientMessage): void => {
        socket.sent.push(message);
      },
      sendAudio: (): void => undefined,
      close: (): void => {
        socket.closed = true;
      },
    };
  },
}));

vi.mock('./capture', () => ({
  openMicrophone: capture.open,
  startCapture: (): { stop: () => void } => ({ stop: capture.stop }),
}));

vi.mock('./playback', () => ({
  Playback: class {
    unlock = vi.fn();
    begin = vi.fn();
    end = vi.fn();
    close = vi.fn();
    push = vi.fn();
    tone(name: string): void {
      tones.played.push(name);
    }
  },
}));

const { WebTalkEngine } = await import('./web-engine');

const CHANNEL = '00000000-0000-4000-8000-000000000001';
const MESSAGE = '00000000-0000-4000-8000-000000000002';
const SPEAKER = {
  kind: 'client',
  id: '00000000-0000-4000-8000-000000000003',
  label: 'Ana',
  detail: null,
} as const;

function current(): OpenedSocket {
  const socket = sockets.opened.at(-1);
  if (socket === undefined) {
    throw new Error('no socket opened');
  }
  return socket;
}

function receive(message: TalkServerMessage): void {
  current().handlers.onMessage(message);
}

function sentTypes(): string[] {
  return current().sent.map((message) => message.type);
}

function ready(engine: InstanceType<typeof WebTalkEngine>): void {
  engine.start({ url: 'http://hub.test', token: 'token' });
  receive({ type: 'ready', clientId: SPEAKER.id, channels: [CHANNEL] });
}

describe('WebTalkEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioEncoder', vi.fn());
    vi.stubGlobal('AudioDecoder', vi.fn());
    vi.stubGlobal('MediaStreamTrackProcessor', vi.fn());
    capture.open.mockReset();
    capture.open.mockReturnValue(new Promise(() => undefined));
    capture.stop.mockReset();
    sockets.opened.length = 0;
    tones.played.length = 0;
    engineState.set({
      link: 'off',
      problem: null,
      transmit: IDLE_TRANSMIT,
      receive: null,
      live: null,
      level: 0,
      lastDenial: null,
      lastEnding: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports a browser without the audio codecs as unsupported and opens no socket', () => {
    vi.stubGlobal('AudioEncoder', undefined);
    const engine = new WebTalkEngine();
    engine.start({ url: 'http://hub.test', token: 'token' });
    expect(engineState.get().link).toBe('unsupported');
    expect(engineState.get().problem).toMatch(/Opus/);
    expect(sockets.opened).toHaveLength(0);
  });

  it('is connecting after start and ready once the server says so', () => {
    const engine = new WebTalkEngine();
    engine.start({ url: 'http://hub.test', token: 'token' });
    expect(engineState.get().link).toBe('connecting');
    receive({ type: 'ready', clientId: SPEAKER.id, channels: [CHANNEL] });
    expect(engineState.get().link).toBe('ready');
  });

  it('asks for the floor on press and talks once it is granted', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    engine.press(CHANNEL);
    expect(engineState.get().transmit).toMatchObject({ status: 'requesting', channelId: CHANNEL });
    expect(current().sent).toContainEqual({ type: 'press', channelId: CHANNEL });
    receive({ type: 'granted', channelId: CHANNEL, messageId: MESSAGE, limitSeconds: 60 });
    expect(engineState.get().transmit).toMatchObject({
      status: 'talking',
      messageId: MESSAGE,
      limitSeconds: 60,
    });
    expect(tones.played).toEqual(['permit']);
  });

  it('gives the floor back when it is granted for a press that was already released', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    receive({ type: 'granted', channelId: CHANNEL, messageId: MESSAGE, limitSeconds: 60 });
    expect(sentTypes()).toEqual(['release']);
    expect(engineState.get().transmit.status).toBe('idle');
  });

  it('returns to idle with the reason when the floor is denied', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    engine.press(CHANNEL);
    receive({ type: 'denied', channelId: CHANNEL, reason: 'busy' });
    expect(engineState.get().transmit.status).toBe('idle');
    expect(engineState.get().lastDenial).toEqual({ channelId: CHANNEL, reason: 'busy' });
    expect(tones.played).toEqual(['busy']);
  });

  it('ends its own message and ignores the end of another one', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    engine.press(CHANNEL);
    receive({ type: 'granted', channelId: CHANNEL, messageId: MESSAGE, limitSeconds: 60 });
    receive({ type: 'ended', messageId: SPEAKER.id, reason: 'released', detail: null });
    expect(engineState.get().transmit.status).toBe('talking');
    receive({ type: 'ended', messageId: MESSAGE, reason: 'time_limit', detail: null });
    expect(engineState.get().transmit.status).toBe('idle');
    expect(engineState.get().lastEnding).toBe('time_limit');
  });

  it('shows who is speaking while receiving and clears it when that message ends', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    receive({ type: 'rx_start', channelId: CHANNEL, messageId: MESSAGE, speaker: SPEAKER });
    expect(engineState.get().receive?.speaker.label).toBe('Ana');
    receive({ type: 'rx_end', messageId: SPEAKER.id });
    expect(engineState.get().receive).not.toBeNull();
    receive({ type: 'rx_end', messageId: MESSAGE });
    expect(engineState.get().receive).toBeNull();
    expect(tones.played).toEqual(['roger']);
  });

  it('does not press while not connected or while a conversation is live', () => {
    const engine = new WebTalkEngine();
    engine.start({ url: 'http://hub.test', token: 'token' });
    engine.press(CHANNEL);
    expect(engineState.get().transmit.status).toBe('idle');
    receive({ type: 'ready', clientId: SPEAKER.id, channels: [CHANNEL] });
    receive({ type: 'live_start', channelId: CHANNEL, conversationId: 'c1', label: 'Jev' });
    engine.press(CHANNEL);
    expect(engineState.get().transmit.status).toBe('idle');
    expect(engineState.get().live).toMatchObject({ conversationId: 'c1', label: 'Jev' });
    receive({ type: 'live_end', channelId: CHANNEL, conversationId: 'other' });
    expect(engineState.get().live).not.toBeNull();
    receive({ type: 'live_end', channelId: CHANNEL, conversationId: 'c1' });
    expect(engineState.get().live).toBeNull();
  });

  it('releases the floor and the microphone on release', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    engine.press(CHANNEL);
    engine.release();
    expect(sentTypes()).toEqual(['press', 'release']);
    expect(engineState.get().transmit.status).toBe('idle');
    engine.release();
    expect(sentTypes()).toEqual(['press', 'release']);
  });

  it('goes offline and reconnects with a growing delay when the socket drops', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    current().handlers.onClose(1006, '');
    expect(engineState.get()).toMatchObject({
      link: 'offline',
      problem: 'Can’t reach your server',
    });
    vi.advanceTimersByTime(999);
    expect(sockets.opened).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets.opened).toHaveLength(2);
    current().handlers.onClose(1006, '');
    vi.advanceTimersByTime(1999);
    expect(sockets.opened).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets.opened).toHaveLength(3);
  });

  it('starts the delay over once the server is ready again', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    current().handlers.onClose(1006, '');
    vi.advanceTimersByTime(1000);
    receive({ type: 'ready', clientId: SPEAKER.id, channels: [CHANNEL] });
    current().handlers.onClose(1006, '');
    vi.advanceTimersByTime(1000);
    expect(sockets.opened).toHaveLength(3);
  });

  it('does not reconnect when the device was removed from the home', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    current().handlers.onClose(4001, '');
    expect(engineState.get().problem).toBe('This device was removed from your home.');
    vi.advanceTimersByTime(60_000);
    expect(sockets.opened).toHaveLength(1);
  });

  it('closes the socket and resets everything on stop', () => {
    const engine = new WebTalkEngine();
    ready(engine);
    engine.press(CHANNEL);
    engine.stop();
    expect(current().closed).toBe(true);
    expect(engineState.get()).toMatchObject({
      link: 'off',
      transmit: IDLE_TRANSMIT,
      receive: null,
      live: null,
    });
    vi.advanceTimersByTime(60_000);
    expect(sockets.opened).toHaveLength(1);
  });
});
