import type { RouterSnapshot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterCollector } from '../../../src/plugins/builtin/router/collector';
import type { RouterShell } from '../../../src/plugins/builtin/router/router-shell';
import type { WireAudience } from '../../../src/plugins/builtin/wire-gate';
import { testLogger } from '../../support/logs';
import { collectReply } from './collect-fixture';

interface Rig {
  readonly collector: RouterCollector;
  readonly lines: string[];
  readonly recorded: RouterSnapshot[];
  readonly published: RouterSnapshot[];
  readonly audiences: WireAudience[];
  readonly shell: { fail: boolean };
}

function rig(): Rig {
  const lines: string[] = [];
  const recorded: RouterSnapshot[] = [];
  const published: RouterSnapshot[] = [];
  const audiences: WireAudience[] = [];
  let bytes = 0;
  const control = { fail: false };
  const shell: RouterShell = {
    collect: (line) => {
      lines.push(line);
      if (control.fail) return Promise.reject(new Error('router unreachable'));
      bytes += 1000;
      return Promise.resolve(
        collectReply({
          at: Date.now() / 1000,
          wanRx: bytes,
          wanTx: bytes,
          busyJiffies: 10,
          slow: line.split(' ')[2] === '1',
          withStatic: true,
        }),
      );
    },
    run: () => Promise.reject(new Error('not used')),
    close: () => undefined,
  };
  const collector = new RouterCollector({
    shell,
    pingTarget: '1.1.1.1',
    log: testLogger('router'),
    record: (snapshot): void => {
      recorded.push(snapshot);
    },
    publish: (snapshot, _full, audience): void => {
      published.push(snapshot);
      audiences.push(audience);
    },
  });
  return { collector, lines, recorded, published, audiences, shell: control };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('router recording', () => {
  it('records every sample while nobody watches and publishes only now and then', async () => {
    const { collector, recorded, published } = rig();
    collector.setCadence('slow');
    await vi.advanceTimersByTimeAsync(60_000);
    collector.stop();
    expect(recorded.length).toBeGreaterThan(45);
    expect(published.length).toBeLessThanOrEqual(3);
    expect(published.length).toBeGreaterThanOrEqual(2);
  });

  it('publishes every sample while the page is watched', async () => {
    const { collector, recorded, published } = rig();
    collector.setCadence('fast');
    await vi.advanceTimersByTimeAsync(20_000);
    collector.stop();
    expect(published).toHaveLength(recorded.length);
    expect(published.length).toBeGreaterThan(10);
  });

  it('sends the per-second frames only to viewers and one frame every 30 s to everyone', async () => {
    const { collector, published, audiences } = rig();
    collector.setCadence('fast');
    await vi.advanceTimersByTimeAsync(60_000);
    collector.stop();
    const everyone = audiences.filter((audience) => audience === 'everyone').length;
    expect(published.length).toBeGreaterThan(50);
    expect(everyone).toBeGreaterThanOrEqual(2);
    expect(everyone).toBeLessThanOrEqual(3);
    expect(audiences.filter((audience) => audience === 'viewers')).toHaveLength(
      published.length - everyone,
    );
  });

  it('asks for the full frame every 10 s when watched and every 30 s otherwise', async () => {
    const quiet = rig();
    quiet.collector.setCadence('slow');
    await vi.advanceTimersByTimeAsync(65_000);
    quiet.collector.stop();
    const quietFull = quiet.lines.filter((line) => line.split(' ')[2] === '1');
    expect(quietFull).toHaveLength(3);
    const watched = rig();
    watched.collector.setCadence('fast');
    await vi.advanceTimersByTimeAsync(65_000);
    watched.collector.stop();
    const watchedFull = watched.lines.filter((line) => line.split(' ')[2] === '1');
    expect(watchedFull.length).toBeGreaterThanOrEqual(6);
    expect(watchedFull.length).toBeLessThanOrEqual(8);
  });

  it('samples every second and reports that interval', async () => {
    const { collector, published } = rig();
    collector.setCadence('fast');
    await vi.advanceTimersByTimeAsync(60_000);
    collector.stop();
    expect(published.at(-1)?.intervalSeconds).toBe(1);
  });

  it('backs off while the router is unreachable and goes back to one second once it answers', async () => {
    const { collector, lines, published, shell } = rig();
    shell.fail = true;
    collector.setCadence('slow');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(lines.length).toBeLessThanOrEqual(7);
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(collector.latest.connection.state).toBe('unreachable');
    expect(collector.latest.intervalSeconds).toBe(30);
    shell.fail = false;
    collector.refreshSoon();
    await vi.advanceTimersByTimeAsync(10);
    expect(published.at(-1)?.connection.state).toBe('online');
    expect(published.at(-1)?.intervalSeconds).toBe(1);
    const before = lines.length;
    await vi.advanceTimersByTimeAsync(5_000);
    collector.stop();
    expect(lines.length - before).toBeGreaterThanOrEqual(4);
  });

  it('stops sampling while paused and publishes the paused state at once', async () => {
    const { collector, recorded, published } = rig();
    collector.setCadence('slow');
    await vi.advanceTimersByTimeAsync(3000);
    const before = recorded.length;
    collector.setCadence('paused');
    await vi.advanceTimersByTimeAsync(10_000);
    collector.stop();
    expect(recorded.length).toBe(before + 1);
    expect(published.at(-1)?.connection.state).toBe('paused');
  });
});
