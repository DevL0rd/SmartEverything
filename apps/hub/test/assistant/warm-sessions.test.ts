import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MissingGeminiKeyError,
  type LiveEvents,
  type LiveOptions,
  type LiveSession,
  type VoiceProvider,
} from '../../src/assistant-voice/gemini';
import type { VoiceLine } from '../../src/assistant-voice/voice-line';
import { WarmSessions, type WarmKey } from '../../src/assistant-voice/warm-sessions';

interface FakeWire {
  readonly options: LiveOptions;
  readonly events: LiveEvents;
  readonly sent: string[];
  alive: boolean;
}

type Answer = 'open' | 'fail' | 'refuse' | 'hang';

class FakeGemini implements VoiceProvider {
  readonly wires: FakeWire[] = [];
  readonly answers: Answer[] = [];

  live(options: LiveOptions, events: LiveEvents): Promise<LiveSession> {
    const wire: FakeWire = { options, events, sent: [], alive: true };
    this.wires.push(wire);
    const answer = this.answers.shift() ?? 'open';
    if (answer === 'fail') {
      return Promise.reject(new Error('socket hang up'));
    }
    if (answer === 'refuse') {
      return Promise.reject(new MissingGeminiKeyError());
    }
    if (answer === 'hang') {
      return new Promise<LiveSession>(() => undefined);
    }
    return Promise.resolve(sessionOf(wire));
  }

  get last(): FakeWire {
    const wire = this.wires.at(-1);
    if (wire === undefined) {
      throw new Error('no wire opened');
    }
    return wire;
  }
}

function isClosed(wire: FakeWire | undefined): boolean {
  return wire?.sent.includes('close') === true;
}

function sessionOf(wire: FakeWire): LiveSession {
  return {
    audio: (): void => {
      wire.sent.push('audio');
    },
    speaking: (): void => {
      wire.sent.push('speaking');
    },
    text: (text): void => {
      wire.sent.push(`text ${text}`);
    },
    picture: (): void => {
      wire.sent.push('picture');
    },
    toolResult: (_id, name, response): void => {
      wire.sent.push(`result ${name} ${JSON.stringify(response)}`);
    },
    video: (): void => {
      wire.sent.push('video');
    },
    close: (): void => {
      wire.sent.push('close');
    },
    alive: () => Promise.resolve(wire.alive),
  };
}

interface Sink {
  readonly events: LiveEvents;
  readonly got: string[];
}

function sinkOf(): Sink {
  const got: string[] = [];
  const events: LiveEvents = {
    audio: () => got.push('audio'),
    said: (text) => got.push(`said ${text}`),
    heard: (text) => got.push(`heard ${text}`),
    interrupted: () => got.push('interrupted'),
    turnComplete: () => got.push('turn'),
    tool: (_id, name) => got.push(`tool ${name}`),
    resumable: (handle) => got.push(`handle ${String(handle)}`),
    goAway: () => got.push('go_away'),
    usage: () => got.push('usage'),
    closed: (reason) => got.push(`closed ${reason}`),
  };
  return { events, got };
}

function optionsOf(overrides: Partial<LiveOptions> = {}): LiveOptions {
  return {
    model: 'gemini-live',
    voice: 'Puck',
    system: 'You are the home voice.',
    tools: [],
    webSearch: false,
    resume: null,
    window: { triggerTokens: 12_000, targetTokens: 9840 },
    automatic: true,
    ...overrides,
  };
}

const KEY: WarmKey = { profileId: 'p1', chatId: 'c1', kind: 'app' };

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('WarmSessions', () => {
  let gemini: FakeGemini;
  let warm: WarmSessions;
  let base: LiveOptions;

  beforeEach(() => {
    vi.useFakeTimers();
    gemini = new FakeGemini();
    warm = new WarmSessions(gemini, Date.now, () => 0.5);
    base = optionsOf();
  });

  afterEach(() => {
    warm.stop();
    vi.useRealTimers();
  });

  async function call(
    callId: string,
    options = base,
    key = KEY,
    enabled = true,
  ): Promise<CallLease> {
    const line = warm.line(key, callId, () => base, enabled);
    const sink = sinkOf();
    const session = await line.live(options, sink.events);
    return { line, sink, session };
  }

  interface CallLease {
    readonly line: VoiceLine;
    readonly sink: Sink;
    readonly session: LiveSession;
  }

  it('creates on the first call, keeps it on release and reuses it with no new connect', async () => {
    const first = await call('a');
    first.line.release(first.session, ['Sam: hi']);
    expect(gemini.wires).toHaveLength(1);
    expect(isClosed(gemini.last)).toBe(false);
    gemini.last.events.resumable('handle-1');
    const second = await call('b');
    expect(gemini.wires).toHaveLength(1);
    expect(second.sink.got).toContain('handle handle-1');
    expect(second.line.known()).toEqual(new Set(['Sam: hi']));
    second.session.text('hello', true);
    expect(gemini.last.sent).toEqual(['text hello']);
  });

  it('connects fresh with the full context when the held socket does not answer a ping', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    first.line.release(first.session, ['Sam: hi']);
    const dead = gemini.last;
    dead.alive = false;
    const second = await call('b');
    expect(isClosed(dead)).toBe(true);
    expect(gemini.wires).toHaveLength(2);
    expect(gemini.last.options.resume).toBeNull();
    expect(second.line.known()).toBeNull();
    expect(second.sink.got).not.toContain('handle handle-1');
    second.session.text('hello', true);
    expect(gemini.last.sent).toEqual(['text hello']);
    expect(dead.sent).toEqual(['close']);
  });

  it('never hands a call the socket Google sent GoAway on', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    first.line.release(first.session, []);
    const away = gemini.last;
    away.events.goAway?.('5s');
    const second = await call('b');
    expect(isClosed(away)).toBe(true);
    expect(gemini.wires).toHaveLength(2);
    second.session.text('hello', true);
    expect(away.sent).toEqual(['close']);
    expect(gemini.last.sent).toEqual(['text hello']);
  });

  it('connects every call fresh and drops idle held sessions when the warm switch is off', async () => {
    const first = await call('a');
    first.line.release(first.session, []);
    const held = gemini.last;
    const plain = await call('b', base, KEY, false);
    expect(isClosed(held)).toBe(true);
    expect(gemini.wires).toHaveLength(2);
    expect(plain.line.known()).toBeNull();
    plain.line.release(plain.session, []);
    expect(isClosed(gemini.last)).toBe(true);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(gemini.wires).toHaveLength(2);
  });

  it('reconnects an idle session at once with the latest handle after a close or a GoAway', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    first.line.release(first.session, []);
    gemini.last.events.closed('server closed', 1011);
    await settle();
    expect(gemini.wires).toHaveLength(2);
    expect(gemini.last.options.resume).toBe('handle-1');
    gemini.last.events.resumable('handle-2');
    const dropped = gemini.last;
    gemini.last.events.goAway?.('10s');
    await settle();
    expect(isClosed(dropped)).toBe(true);
    expect(gemini.wires).toHaveLength(3);
    expect(gemini.last.options.resume).toBe('handle-2');
  });

  it('backs off on repeated failures up to five minutes and stops on a refused key', async () => {
    const first = await call('a');
    first.line.release(first.session, []);
    gemini.answers.push(...Array.from({ length: 10 }, (): Answer => 'fail'));
    vi.advanceTimersByTime(STABLE_LIFE_MS);
    gemini.last.events.closed('server closed', 1011);
    await settle();
    expect(gemini.wires).toHaveLength(2);
    const waits = [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 300_000, 300_000];
    for (const wait of waits) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      const before = gemini.wires.length;
      await vi.advanceTimersByTimeAsync(1);
      expect(gemini.wires.length).toBe(before + 1);
    }
    gemini.answers.splice(0, gemini.answers.length, 'refuse');
    await vi.advanceTimersByTimeAsync(300_000);
    const stoppedAt = gemini.wires.length;
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(gemini.wires).toHaveLength(stoppedAt);
    await call('b');
    expect(gemini.wires).toHaveLength(stoppedAt + 1);
    expect(gemini.last.options.resume).toBeNull();
  });

  it('starts fresh at once when the handle is rejected, so the next call rebuilds the context', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    first.line.release(first.session, ['Sam: hi']);
    gemini.answers.push('hang');
    vi.advanceTimersByTime(STABLE_LIFE_MS);
    gemini.last.events.closed('server closed', 1011);
    await settle();
    expect(gemini.last.options.resume).toBe('handle-1');
    gemini.last.events.closed('BidiGenerateContent session not found or expired', 1008);
    await settle();
    expect(gemini.wires).toHaveLength(3);
    expect(gemini.last.options.resume).toBeNull();
    const second = await call('b');
    expect(gemini.wires).toHaveLength(3);
    expect(second.line.known()).toBeNull();
  });

  it('resumes with the new prompt when it changed at the call, and an idle reconnect picks up the newest prompt', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    first.line.release(first.session, []);
    const changed = optionsOf({ system: 'You are a pirate.' });
    base = changed;
    const second = await call('b', changed);
    expect(gemini.wires).toHaveLength(2);
    expect(isClosed(gemini.wires[0])).toBe(true);
    expect(gemini.last.options).toMatchObject({ system: 'You are a pirate.', resume: 'handle-1' });
    gemini.last.events.resumable('handle-2');
    second.line.release(second.session, []);
    base = optionsOf({ system: 'You are a poet.' });
    gemini.last.events.goAway?.('10s');
    await settle();
    expect(gemini.wires).toHaveLength(3);
    expect(gemini.last.options).toMatchObject({ system: 'You are a poet.', resume: 'handle-2' });
    await call('c');
    expect(gemini.wires).toHaveLength(3);
  });

  it('starts a fresh session when the model changed', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    first.line.release(first.session, []);
    base = optionsOf({ model: 'gemini-live-next' });
    await call('b', base);
    expect(gemini.last.options).toMatchObject({ model: 'gemini-live-next', resume: null });
  });

  it('sends nothing while idle and never forwards idle output to a finished call', async () => {
    const first = await call('a');
    first.line.release(first.session, []);
    first.session.audio(new Int16Array(4));
    first.session.video({ data: Buffer.from('x'), mimeType: 'image/jpeg' });
    first.session.text('late', true);
    first.session.picture({ data: Buffer.from('x'), mimeType: 'image/jpeg' });
    first.session.speaking(true);
    first.session.close();
    gemini.last.events.audio(new Int16Array(4));
    gemini.last.events.said('stray');
    gemini.last.events.tool('t1', 'set_device', {});
    expect(first.sink.got).toEqual([]);
    expect(isClosed(gemini.last)).toBe(false);
    expect(gemini.last.sent).toEqual([
      'result set_device {"error":"No conversation is running right now."}',
    ]);
  });

  it('gives a second concurrent call its own separate session and keeps people and chats apart', async () => {
    const held = await call('a');
    const busy = await call('b');
    expect(gemini.wires).toHaveLength(2);
    busy.line.release(busy.session, []);
    expect(isClosed(gemini.wires[1])).toBe(true);
    expect(isClosed(gemini.wires[0])).toBe(false);
    await call('c', base, { ...KEY, profileId: 'p2' });
    await call('d', base, { ...KEY, chatId: 'c2' });
    expect(gemini.wires).toHaveLength(4);
    held.line.release(held.session, []);
  });

  it('hands the session of a superseded wake loser to the winner', async () => {
    const loser = await call('loser');
    loser.line.release(loser.session, []);
    const winner = await call('winner');
    expect(gemini.wires).toHaveLength(1);
    gemini.last.events.said('hello');
    expect(winner.sink.got).toEqual(['said hello']);
    expect(loser.sink.got).toEqual([]);
  });

  it('returns a sight call session to the base config when the call ends', async () => {
    const sight = await call('a', optionsOf({ resolution: 'medium' }));
    gemini.last.events.resumable('handle-1');
    sight.line.release(sight.session, []);
    await settle();
    expect(gemini.wires).toHaveLength(2);
    expect(isClosed(gemini.wires[0])).toBe(true);
    expect(gemini.last.options.resume).toBe('handle-1');
    expect(gemini.last.options.resolution).toBeUndefined();
  });

  it('carries renewals inside a call through the held session', async () => {
    const first = await call('a');
    gemini.last.events.resumable('handle-1');
    gemini.last.events.closed('server closed', 1011);
    expect(first.sink.got).toContain('closed server closed');
    first.session.close();
    const renewed = await first.line.live(optionsOf({ resume: 'handle-1' }), first.sink.events);
    expect(gemini.wires).toHaveLength(2);
    first.line.release(renewed, []);
    expect(isClosed(gemini.last)).toBe(false);
    await call('b');
    expect(gemini.wires).toHaveLength(2);
  });

  it('closes every held session on stop and never reconnects afterwards', async () => {
    const first = await call('a');
    first.line.release(first.session, []);
    const wire = gemini.last;
    warm.stop();
    expect(isClosed(wire)).toBe(true);
    wire.events.closed('closed', 1000);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(gemini.wires).toHaveLength(1);
    const line = warm.line(KEY, 'late', () => base);
    expect(line.known()).toBeNull();
  });
});

const STABLE_LIFE_MS = 30_000;
