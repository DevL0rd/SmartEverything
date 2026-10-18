import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildHost, type ChildCrash } from '../../../src/plugins/isolation/child-host';
import {
  ChildCrashedError,
  ChildUnavailableError,
  FRAME,
  type Frame,
} from '../../../src/plugins/isolation/frames';
import type { ChildHandle } from '../../../src/plugins/isolation/spawn';
import { captureLogs, testLogger } from '../../support/logs';

class FakeChild implements ChildHandle {
  readonly pid = 4242;
  readonly sent: Frame[] = [];
  killed = false;
  open = true;
  private frames: ((frame: Frame) => void)[] = [];
  private invalids: ((error: Error) => void)[] = [];
  private exits: ((code: number | null, signal: string | null) => void)[] = [];

  send = (frame: Frame): boolean => {
    this.sent.push(frame);
    return this.open;
  };
  kill = (): void => {
    this.killed = true;
  };
  onFrame = (listener: (frame: Frame) => void): void => {
    this.frames.push(listener);
  };
  onInvalid = (listener: (error: Error) => void): void => {
    this.invalids.push(listener);
  };
  onExit = (listener: (code: number | null, signal: string | null) => void): void => {
    this.exits.push(listener);
  };

  deliver(frame: Frame): void {
    this.frames.forEach((listener) => {
      listener(frame);
    });
  }

  reject(error: Error): void {
    this.invalids.forEach((listener) => {
      listener(error);
    });
  }

  crash(code: number | null, signal: string | null): void {
    this.exits.forEach((listener) => {
      listener(code, signal);
    });
  }
}

let children: FakeChild[];
let host: ChildHost;

function spawner(): ChildHandle {
  const child = new FakeChild();
  children.push(child);
  return child;
}

function current(): FakeChild {
  const child = children.at(-1);
  if (child === undefined) {
    throw new Error('no child was started');
  }
  return child;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T10:00:00.000Z'));
  captureLogs();
  children = [];
  host = new ChildHost({ kind: 'voice', spawn: spawner, log: testLogger('plugins') });
});

afterEach(() => {
  host.retire();
  vi.useRealTimers();
});

describe('calls', () => {
  it('starts the child on the first call and resolves with the reply payload', async () => {
    expect(host.running).toBe(false);
    const call = host.call('join', { channel: 7 }, 1000);
    expect(host.running).toBe(true);
    expect(current().sent).toEqual([
      { kind: 'call', id: 1, name: 'join', payload: { channel: 7 } },
    ]);
    current().deliver({ kind: 'reply', id: 1, ok: true, payload: 'joined', error: null });
    await expect(call).resolves.toBe('joined');
  });

  it('reuses the running child and numbers calls in order', async () => {
    const first = host.call('a', null, 1000);
    const second = host.call('b', null, 1000);
    expect(children).toHaveLength(1);
    current().deliver({ kind: 'reply', id: 2, ok: true, payload: 'B', error: null });
    current().deliver({ kind: 'reply', id: 1, ok: true, payload: 'A', error: null });
    await expect(Promise.all([first, second])).resolves.toEqual(['A', 'B']);
  });

  it('rejects with the child error message when the reply is not ok', async () => {
    const call = host.call('join', null, 1000);
    current().deliver({ kind: 'reply', id: 1, ok: false, payload: null, error: 'no such channel' });
    await expect(call).rejects.toThrow('no such channel');
    const next = host.call('join', null, 1000);
    current().deliver({ kind: 'reply', id: 2, ok: false, payload: null, error: null });
    await expect(next).rejects.toThrow('The call failed');
  });

  it('rejects a call the child does not answer in time', async () => {
    const call = host.call('join', null, 500);
    const failure = expect(call).rejects.toThrow(
      'The voice process is not available: join did not answer in time',
    );
    await vi.advanceTimersByTimeAsync(500);
    await failure;
    current().deliver({ kind: 'reply', id: 1, ok: true, payload: 'late', error: null });
  });

  it('rejects at once when the channel to the child is closed', async () => {
    host.call('warm', null, 1000).catch(() => undefined);
    current().open = false;
    await expect(host.call('join', null, 1000)).rejects.toThrow('its channel is closed');
  });

  it('ignores a reply for a call that is no longer waiting', () => {
    host.call('join', null, 1000).catch(() => undefined);
    expect(() => {
      current().deliver({ kind: 'reply', id: 99, ok: true, payload: null, error: null });
    }).not.toThrow();
  });
});

describe('events', () => {
  it('passes child events to every listener and sends events to the child', () => {
    const seen: string[] = [];
    host.onEvent((name, payload) => seen.push(`a:${name}:${String(payload)}`));
    host.onEvent((name) => seen.push(`b:${name}`));
    host.call('x', null, 1000).catch(() => undefined);
    current().deliver({ kind: 'event', name: 'speaking', payload: 'ana' });
    expect(seen).toEqual(['a:speaking:ana', 'b:speaking']);
    expect(host.send('mute', true)).toBe(true);
    expect(current().sent.at(-1)).toEqual({ kind: 'event', name: 'mute', payload: true });
  });

  it('does not start a child to send an event', () => {
    expect(host.send('mute', true)).toBe(false);
    expect(children).toHaveLength(0);
  });

  it('logs and survives a frame that does not parse', () => {
    const logs = captureLogs();
    host.call('x', null, 1000).catch(() => undefined);
    current().reject(new Error('bad frame'));
    expect(logs.events()).toContain('plugin.child_frame_invalid');
  });
});

describe('crashes', () => {
  it('rejects waiting calls, reports the crash and refuses calls until the restart', async () => {
    const crashes: ChildCrash[] = [];
    host.onCrash((crash) => crashes.push(crash));
    const waiting = host.call('join', null, 10_000);
    const failure = expect(waiting).rejects.toBeInstanceOf(ChildCrashedError);
    current().crash(null, 'SIGSEGV');
    await failure;
    expect(host.running).toBe(false);
    expect(crashes).toHaveLength(1);
    expect(crashes[0]).toMatchObject({
      signal: 'SIGSEGV',
      code: null,
      pid: 4242,
      restartInMs: 1000,
    });
    expect(crashes[0]?.error.message).toBe('The voice process stopped unexpectedly (SIGSEGV)');
    expect(() => host.call('join', null, 1000)).toThrow(
      new ChildUnavailableError('voice', 'it is restarting after a crash (about 1 s)'),
    );
  });

  it('starts the child again after the backoff delay and takes calls once more', async () => {
    host.call('join', null, 10_000).catch(() => undefined);
    current().crash(1, null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.running).toBe(true);
    expect(children).toHaveLength(2);
    const call = host.call('join', null, 1000);
    current().deliver({ kind: 'reply', id: 2, ok: true, payload: 'ok', error: null });
    await expect(call).resolves.toBe('ok');
  });

  it('doubles the delay while the child keeps crashing right after it starts', async () => {
    const delays: number[] = [];
    host.onCrash((crash) => delays.push(crash.restartInMs));
    host.call('join', null, 10_000).catch(() => undefined);
    for (const wait of [1000, 2000, 4000]) {
      current().crash(1, null);
      await vi.advanceTimersByTimeAsync(wait);
    }
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('resets the delay when the child ran stably for a minute', async () => {
    const delays: number[] = [];
    host.onCrash((crash) => delays.push(crash.restartInMs));
    host.hold();
    host.call('join', null, 10_000).catch(() => undefined);
    current().crash(1, null);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    current().crash(1, null);
    expect(delays).toEqual([1000, 1000]);
  });

  it('names an exit code when no signal ended the child', () => {
    const crashes: ChildCrash[] = [];
    host.onCrash((crash) => crashes.push(crash));
    host.call('join', null, 10_000).catch(() => undefined);
    current().crash(3, null);
    expect(crashes[0]?.error.message).toBe('The voice process stopped unexpectedly (exit code 3)');
  });
});

describe('retire and idle', () => {
  it('kills the child, rejects waiting calls and does not report a crash', async () => {
    const crashes: ChildCrash[] = [];
    host.onCrash((crash) => crashes.push(crash));
    const waiting = host.call('join', null, 10_000);
    const failure = expect(waiting).rejects.toThrow('it was stopped');
    const child = current();
    host.retire();
    child.crash(null, 'SIGKILL');
    await failure;
    expect(child.killed).toBe(true);
    expect(host.running).toBe(false);
    expect(crashes).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(children).toHaveLength(1);
  });

  it('cancels a pending restart when retired', async () => {
    host.call('join', null, 10_000).catch(() => undefined);
    current().crash(1, null);
    host.retire();
    await vi.advanceTimersByTimeAsync(5000);
    expect(children).toHaveLength(1);
    expect(host.running).toBe(false);
  });

  it('stops an idle child after 30 s and starts a new one for the next call', async () => {
    host.call('join', null, 1000).catch(() => undefined);
    const first = current();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(first.killed).toBe(true);
    expect(host.running).toBe(false);
    host.call('join', null, 1000).catch(() => undefined);
    expect(children).toHaveLength(2);
  });

  it('keeps the child while something holds it and arms the idle timer when the last hold ends', async () => {
    host.call('join', null, 1000).catch(() => undefined);
    const first = current();
    const releaseA = host.hold();
    const releaseB = host.hold();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(first.killed).toBe(false);
    releaseA();
    releaseA();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(first.killed).toBe(false);
    releaseB();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(first.killed).toBe(true);
  });

  it('honours a configured idle time', async () => {
    const quick = new ChildHost({ kind: 'voice', spawn: spawner, idleMs: 100 });
    quick.call('join', null, 1000).catch(() => undefined);
    const child = current();
    await vi.advanceTimersByTimeAsync(100);
    expect(child.killed).toBe(true);
  });
});

describe('frames', () => {
  it('accepts calls, replies and events and refuses unknown kinds and extra fields', () => {
    expect(FRAME.safeParse({ kind: 'call', id: 1, name: 'x', payload: null }).success).toBe(true);
    expect(
      FRAME.safeParse({ kind: 'reply', id: 1, ok: true, payload: 1, error: null }).success,
    ).toBe(true);
    expect(FRAME.safeParse({ kind: 'event', name: 'x', payload: null }).success).toBe(true);
    expect(FRAME.safeParse({ kind: 'noise' }).success).toBe(false);
    expect(FRAME.safeParse({ kind: 'event', name: 'x', payload: null, extra: 1 }).success).toBe(
      false,
    );
    expect(FRAME.safeParse({ kind: 'call', id: 1.5, name: 'x', payload: null }).success).toBe(
      false,
    );
  });
});
