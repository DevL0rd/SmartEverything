import type { ListeningConfig, RemoteEarNodeMessage } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChildHost } from '../../../src/plugins/isolation/child-host';
import type { Frame } from '../../../src/plugins/isolation/frames';
import type { ChildHandle } from '../../../src/plugins/isolation/spawn';
import type { EarsFrame } from '../../../src/node/ear/ear-host';
import { EarProcess } from '../../../src/node/ear/process/ear-process';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { FakeClock } from '../../support/fake-clock';
import { configOf } from './ear-fakes';

const START = '2026-10-24T09:00:00.000Z';

class FakeChild implements ChildHandle {
  readonly sent: Frame[] = [];
  killed = false;
  silentCalls = new Set<string>();
  full = false;
  private frames: ((frame: Frame) => void) | null = null;
  private exits: ((code: number | null, signal: string | null) => void) | null = null;

  constructor(readonly pid: number) {}

  send(frame: Frame): boolean {
    if (this.full) {
      return false;
    }
    this.sent.push(frame);
    if (frame.kind === 'call' && !this.silentCalls.has(frame.name)) {
      const reply: Frame = { kind: 'reply', id: frame.id, ok: true, payload: null, error: null };
      queueMicrotask(() => {
        this.frames?.(reply);
      });
    }
    return true;
  }

  kill(): void {
    this.killed = true;
  }

  onFrame(listener: (frame: Frame) => void): void {
    this.frames = listener;
  }

  onInvalid(): void {
    return undefined;
  }

  onExit(listener: (code: number | null, signal: string | null) => void): void {
    this.exits = listener;
  }

  emit(name: string, payload: unknown): void {
    this.frames?.({ kind: 'event', name, payload });
  }

  exit(code: number | null, signal: string | null): void {
    this.exits?.(code, signal);
  }

  calls(name: string): unknown[] {
    return this.sent.flatMap((frame) =>
      frame.kind === 'call' && frame.name === name ? [frame.payload] : [],
    );
  }

  events(name: string): unknown[] {
    return this.sent.flatMap((frame) =>
      frame.kind === 'event' && frame.name === name ? [frame.payload] : [],
    );
  }
}

interface Rig {
  readonly process: EarProcess;
  readonly children: FakeChild[];
  readonly sent: { key: string; message: RemoteEarNodeMessage }[];
  readonly scored: { id: string; heard: boolean }[];
  readonly failed: { id: string; reason: string }[];
}

let logs: CapturedLogs;

beforeEach(() => {
  vi.useFakeTimers();
  logs = captureLogs();
});

afterEach(() => {
  vi.useRealTimers();
  Logger.reset();
});

function rig(): Rig {
  const children: FakeChild[] = [];
  const log = new Logger('hub.node-ear');
  const host = new ChildHost({
    kind: 'ear',
    log,
    spawn: (): FakeChild => {
      const child = new FakeChild(1000 + children.length);
      children.push(child);
      return child;
    },
  });
  const process = new EarProcess({
    host,
    wakeDiagnosticsDirectory: '/data',
    logPath: '/data/service.log',
    release: '0.1.0',
    level: 'info',
    clock: new FakeClock(START),
    log,
  });
  return { process, children, sent: [], scored: [], failed: [] };
}

function portOf(test: Rig): ReturnType<EarProcess['hostPort']> {
  return test.process.hostPort({
    send: (key, message): void => {
      test.sent.push({ key, message });
    },
    scored: (id, heard): void => {
      test.scored.push({ id, heard });
    },
    scoreFailed: (id, reason): void => {
      test.failed.push({ id, reason });
    },
  });
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

async function started(test: Rig): Promise<FakeChild> {
  await settle();
  const child = test.children.at(-1);
  if (child === undefined) {
    throw new Error('The ear process was not started');
  }
  child.emit('ready', null);
  await settle();
  return child;
}

function openFrame(config: ListeningConfig = configOf()): EarsFrame {
  return {
    type: 'ears_open',
    source: { kind: 'camera', key: 'cam' },
    codec: 'opus_48k_mono',
    config,
  };
}

const configFrame = (config: ListeningConfig): EarsFrame => ({
  type: 'ears',
  key: 'cam',
  ear: { kind: 'config', config },
});

const restFrame: EarsFrame = {
  type: 'ears',
  key: 'cam',
  ear: { kind: 'rest', reason: 'conversation' },
};

async function crash(test: Rig, child: FakeChild): Promise<FakeChild> {
  child.exit(1, null);
  await vi.advanceTimersByTimeAsync(1000);
  return started(test);
}

describe('ear process start', () => {
  it('starts the child with the data directory, log path and level, then reports ready', async () => {
    const test = rig();
    portOf(test);
    const child = await started(test);
    expect(child.calls('init')).toEqual([
      {
        wakeDiagnosticsDirectory: '/data',
        logPath: '/data/service.log',
        level: 'info',
        release: '0.1.0',
      },
    ]);
    expect(test.process.ready).toBe(true);
  });

  it('forwards the frames of a port with its id and routes what the child sends back', async () => {
    const test = rig();
    const port = portOf(test);
    const child = await started(test);
    port.receive(openFrame());
    expect(child.events('frame')).toEqual([{ port: 1, frame: openFrame() }]);
    child.emit('send', { port: 1, key: 'cam', message: { kind: 'closed' } });
    child.emit('scored', { port: 1, id: 'a', heard: true });
    child.emit('score_failed', { port: 1, id: 'b', reason: 'broken' });
    expect(test.sent).toEqual([{ key: 'cam', message: { kind: 'closed' } }]);
    expect(test.scored).toEqual([{ id: 'a', heard: true }]);
    expect(test.failed).toEqual([{ id: 'b', reason: 'broken' }]);
  });

  it('keeps the ports apart so that stopping one never closes the ears of another', async () => {
    const test = rig();
    const first = portOf(test);
    const second = portOf(test);
    const child = await started(test);
    first.receive(openFrame());
    second.receive(openFrame());
    await first.stop();
    expect(child.calls('port_stop')).toEqual([{ port: 1 }]);
    child.emit('send', { port: 2, key: 'cam', message: { kind: 'closed' } });
    expect(test.sent).toHaveLength(1);
  });

  it('writes the log lines of the child into the service log under their own scope and event', async () => {
    const test = rig();
    portOf(test);
    const child = await started(test);
    child.emit('log', {
      level: 'warn',
      scope: 'hub.node-ear',
      event: 'wake.detection_failed',
      payload: { reason: 'Aborted()' },
    });
    const record = logs.records.find((one) => one.event === 'wake.detection_failed');
    expect(record?.level).toBe('warn');
    expect(record?.scope).toBe('hub.node-ear');
    expect(record?.payload).toEqual({ reason: 'Aborted()' });
  });

  it('ignores an event it does not understand and says so', async () => {
    const test = rig();
    portOf(test);
    const child = await started(test);
    child.emit('send', { port: 'x' });
    child.emit('mystery', null);
    expect(logs.events()).toContain('ear_process.event_invalid');
    expect(logs.events()).toContain('ear_process.event_unknown');
  });
});

describe('ear process restart', () => {
  it('opens the ears again with their latest policy after the child died', async () => {
    const test = rig();
    const port = portOf(test);
    const first = await started(test);
    const latest = configOf({ threshold: 0.2 });
    port.receive(openFrame());
    port.receive(configFrame(latest));
    port.receive(restFrame);
    const second = await crash(test, first);
    expect(second).not.toBe(first);
    expect(second.events('frame')).toEqual([
      { port: 1, frame: openFrame() },
      { port: 1, frame: configFrame(latest) },
      { port: 1, frame: restFrame },
    ]);
  });

  it('does not open an ear again that the hub closed', async () => {
    const test = rig();
    const port = portOf(test);
    const first = await started(test);
    port.receive(openFrame());
    port.receive({ type: 'ears_close', key: 'cam' });
    const second = await crash(test, first);
    expect(second.events('frame')).toEqual([]);
  });

  it('answers the close and the scoring the dead child can no longer answer', async () => {
    const test = rig();
    const port = portOf(test);
    const first = await started(test);
    port.receive(openFrame());
    port.receive({ type: 'ears_close', key: 'cam' });
    port.receive({ type: 'ears_score', id: 'one', keywords: ['hey'], threshold: 0.2, pcm: '' });
    await crash(test, first);
    expect(test.sent).toEqual([{ key: 'cam', message: { kind: 'closed' } }]);
    expect(test.failed.map((one) => one.id)).toEqual(['one']);
  });

  it('kills and restarts a child that stops answering its pings', async () => {
    const test = rig();
    portOf(test);
    const first = await started(test);
    first.silentCalls.add('ping');
    await vi.advanceTimersByTimeAsync(5000 + 15_000);
    expect(first.killed).toBe(true);
    expect(logs.events()).toContain('ear_process.unresponsive');
    expect(test.process.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const second = await started(test);
    expect(second).not.toBe(first);
    expect(test.process.ready).toBe(true);
  });
});

describe('ear process under load', () => {
  it('keeps a child whose channel is full for a while and answers again in time', async () => {
    const test = rig();
    portOf(test);
    const child = await started(test);
    child.full = true;
    await vi.advanceTimersByTimeAsync(10_000);
    child.full = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(child.killed).toBe(false);
    expect(logs.events()).not.toContain('ear_process.unresponsive');
    expect(test.process.ready).toBe(true);
  });

  it('restarts a child whose channel stays full for the whole timeout', async () => {
    const test = rig();
    portOf(test);
    const child = await started(test);
    child.full = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(child.killed).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(child.killed).toBe(true);
    expect(logs.events()).toContain('ear_process.unresponsive');
  });
});

describe('ear process local pipeline', () => {
  const handlers = (): {
    readonly claims: unknown[];
    readonly failures: string[];
    readonly handlers: Parameters<EarProcess['pipeline']>[1];
  } => {
    const claims: unknown[] = [];
    const failures: string[] = [];
    return {
      claims,
      failures,
      handlers: {
        claimed: (claim): void => {
          claims.push(claim);
        },
        segment: (): void => undefined,
        failed: (reason): void => {
          failures.push(reason);
        },
      },
    };
  };

  it('opens a pipeline in the child, feeds it audio and hands back its claim', async () => {
    const test = rig();
    const seen = handlers();
    const opening = test.process.pipeline(configOf(), seen.handlers);
    const child = await started(test);
    const pipeline = await opening;
    const pcm = new Int16Array([1, 2, 3]);
    pipeline.hear(pcm);
    expect(child.events('local_audio')).toEqual([{ id: 1, pcm }]);
    const words = new Int16Array([4, 5]);
    child.emit('local_claim', { id: 1, phrase: 'hey', snippetDbfs: -20, words });
    child.emit('local_failed', { id: 1, reason: 'broken' });
    expect(seen.claims).toEqual([{ phrase: 'hey', snippetDbfs: -20, words }]);
    expect(seen.failures).toEqual(['broken']);
  });

  it('opens the pipeline again in a new child and closes it when asked', async () => {
    const test = rig();
    const config = configOf();
    const seen = handlers();
    const opening = test.process.pipeline(config, seen.handlers);
    const first = await started(test);
    const pipeline = await opening;
    expect(first.calls('local_open')).toEqual([{ id: 1, config }]);
    const second = await crash(test, first);
    expect(second.calls('local_open')).toEqual([{ id: 1, config }]);
    await pipeline.close();
    expect(second.calls('local_close')).toEqual([{ id: 1 }]);
  });
});
