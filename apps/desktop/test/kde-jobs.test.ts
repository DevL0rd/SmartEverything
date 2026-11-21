import { Variant, type Message } from '@jellybrick/dbus-next';
import { describe, expect, it, vi } from 'vitest';

import {
  KdeSyncJobs,
  jobPropertiesOf,
  type JobBus,
  type SyncJobProgress,
} from '../src/kde-jobs.js';

const PROGRESS: SyncJobProgress = {
  title: 'Syncing My Drive',
  percent: 25.7,
  processedBytes: 1000,
  totalBytes: 4000,
  processedFiles: 1,
  totalFiles: 4,
  bytesPerSecond: 2000,
  current: 'docs/report.pdf',
  info: '3 files left',
};

interface FakeBus extends JobBus {
  readonly sent: Message[];
  readonly calls: Message[];
}

function fakeBus(serverRunning: boolean): FakeBus {
  const sent: Message[] = [];
  const calls: Message[] = [];
  return {
    sent,
    calls,
    call: (message): Promise<{ readonly body: unknown[] }> => {
      calls.push(message);
      if (message.member === 'NameHasOwner') return Promise.resolve({ body: [serverRunning] });
      return Promise.resolve({ body: ['/org/kde/jobs/JobView_1'] });
    },
    send: (message): void => {
      sent.push(message);
    },
    on: vi.fn(),
    disconnect: vi.fn(),
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

describe('KDE job views for sync progress', () => {
  it('maps the progress to the JobViewV3 update properties', () => {
    const properties = jobPropertiesOf(PROGRESS);
    expect(properties['percent']).toEqual(new Variant('u', 25));
    expect(properties['processedBytes']).toEqual(new Variant('t', 1000n));
    expect(properties['totalFiles']).toEqual(new Variant('t', 4n));
    expect(properties['speed']).toEqual(new Variant('t', 2000n));
    expect(properties['descriptionValue1']).toEqual(new Variant('s', 'docs/report.pdf'));
    const quiet = jobPropertiesOf({ ...PROGRESS, bytesPerSecond: null, current: null });
    expect(quiet['speed']).toBeUndefined();
    expect(quiet['descriptionLabel1']).toBeUndefined();
  });

  it('requests one view, updates it in place and terminates it with the error text', async () => {
    const bus = fakeBus(true);
    const jobs = new KdeSyncJobs('linux', () => bus);
    const job = jobs.open(PROGRESS);
    job.update({ ...PROGRESS, processedBytes: 2000 });
    await settle();
    expect(jobs.status()).toEqual({ state: 'ready' });
    expect(bus.calls.map((message) => message.member)).toEqual(['NameHasOwner', 'requestView']);
    job.update({ ...PROGRESS, processedBytes: 3000 });
    job.finish({ kind: 'failed', message: '1 file needs attention' });
    job.update({ ...PROGRESS, processedBytes: 4000 });
    expect(bus.sent.map((message) => message.member)).toEqual(['update', 'update', 'terminate']);
    expect(bus.sent.every((message) => message.path === '/org/kde/jobs/JobView_1')).toBe(true);
    expect(bus.sent[0]?.body[0]).toMatchObject({ processedBytes: new Variant('t', 2000n) });
    expect(bus.sent[2]?.body).toEqual([100, '1 file needs attention', {}]);
  });

  it('terminates a job that ended before its view arrived', async () => {
    const bus = fakeBus(true);
    const job = new KdeSyncJobs('linux', () => bus).open(PROGRESS);
    job.finish({ kind: 'paused' });
    await settle();
    expect(bus.sent.map((message) => message.member)).toEqual(['update', 'terminate']);
    expect(bus.sent[1]?.body).toEqual([1, 'Sync paused', {}]);
  });

  it('reports the job progress unavailable when the desktop has no job view server', async () => {
    const bus = fakeBus(false);
    const jobs = new KdeSyncJobs('linux', () => bus);
    const seen = vi.fn();
    jobs.onStatus(seen);
    jobs.open(PROGRESS).finish({ kind: 'done' });
    await settle();
    expect(seen).toHaveBeenCalledWith({
      state: 'unavailable',
      reason: 'this desktop has no org.kde.JobViewServer service',
    });
    expect(bus.calls.map((message) => message.member)).toEqual(['NameHasOwner']);
    expect(bus.sent).toEqual([]);
    expect(new KdeSyncJobs('win32').status()).toEqual({
      state: 'unavailable',
      reason: 'job progress needs KDE Plasma on Linux',
    });
  });
});
