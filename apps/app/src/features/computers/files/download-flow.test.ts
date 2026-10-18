import { describe, expect, it } from 'vitest';
import type { ComputerDownload } from '@smarteverything/domain';
import type { PreparedDownload } from '../../../api/computer-downloads';
import {
  DownloadFlow,
  type DownloadIntent,
  type DownloadOutcome,
  type DownloadTarget,
} from './download-flow';

const FOLDER: DownloadTarget = { path: '/home/dana/proj', name: 'proj', kind: 'folder' };
const FILE: DownloadTarget = { path: '/home/dana/a.txt', name: 'a.txt', kind: 'file' };

function download(kind: ComputerDownload['kind'], name: string): ComputerDownload {
  return {
    kind,
    name,
    size: kind === 'file' ? 10 : null,
    files: 1,
    folders: 0,
    bytes: 10,
    skipped: [],
    url: '/media/x',
    expiresAt: '2026-10-18T10:00:00Z',
  };
}

interface Rig {
  readonly flow: DownloadFlow;
  readonly prepared: string[][];
  readonly performed: string[];
  readonly aborted: string[];
  readonly release: (outcome: DownloadOutcome) => void;
  readonly fail: (error: Error) => void;
}

function rig(): Rig {
  const prepared: string[][] = [];
  const performed: string[] = [];
  const aborted: string[] = [];
  let release: (outcome: DownloadOutcome) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  let count = 0;
  const flow = new DownloadFlow({
    prepare: (paths): Promise<PreparedDownload> => {
      prepared.push([...paths]);
      count += 1;
      const folder = paths.length > 1 || paths[0] === FOLDER.path;
      return Promise.resolve({
        download: download(folder ? 'zip' : 'file', folder ? 'proj.zip' : 'a.txt'),
        url: `http://local/${String(count)}`,
      });
    },
    perform: (intent: DownloadIntent, { url }): Promise<DownloadOutcome> => {
      performed.push(`${intent} ${url}`);
      return new Promise((resolve, reject) => {
        release = resolve;
        fail = reject;
      });
    },
    abort: ({ url }): Promise<void> => {
      aborted.push(url);
      return Promise.resolve();
    },
  });
  return {
    flow,
    prepared,
    performed,
    aborted,
    release: (outcome): void => {
      release(outcome);
    },
    fail: (error): void => {
      fail(error);
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('DownloadFlow', () => {
  it('prepares the chosen items and waits for the person to pick what to do', async () => {
    const { flow, prepared } = rig();
    flow.start([FILE, FOLDER]);
    expect(flow.state.get().kind).toBe('preparing');
    await settle();
    expect(prepared).toEqual([[FILE.path, FOLDER.path]]);
    expect(flow.state.get().kind).toBe('ready');
  });

  it('saves, then reports done', async () => {
    const { flow, performed, release } = rig();
    flow.start([FILE]);
    await settle();
    const running = flow.run('save');
    await settle();
    expect(flow.state.get().kind).toBe('working');
    release('completed');
    await running;
    expect(performed).toEqual(['save http://local/1']);
    expect(flow.state.get()).toMatchObject({ kind: 'done', intent: 'save', outcome: 'completed' });
  });

  it('goes back to ready when the person cancels the phone’s save dialog', async () => {
    const { flow, release } = rig();
    flow.start([FILE]);
    await settle();
    const running = flow.run('save');
    await settle();
    release('cancelled');
    await running;
    expect(flow.state.get().kind).toBe('ready');
  });

  it('reuses a file link but asks for a new zip after a zip was used', async () => {
    const { flow, prepared, performed, release } = rig();
    flow.start([FOLDER]);
    await settle();
    const first = flow.run('save');
    await settle();
    release('completed');
    await first;
    const second = flow.run('share');
    await settle();
    release('completed');
    await second;
    expect(prepared).toHaveLength(2);
    expect(performed).toEqual(['save http://local/1', 'share http://local/2']);
    const single = rig();
    single.flow.start([FILE]);
    await settle();
    const one = single.flow.run('save');
    await settle();
    single.release('completed');
    await one;
    const two = single.flow.run('open');
    await settle();
    single.release('completed');
    await two;
    expect(single.prepared).toHaveLength(1);
  });

  it('cancels a running save and returns to ready without an error', async () => {
    const { flow, aborted, fail } = rig();
    flow.start([FOLDER]);
    await settle();
    const running = flow.run('save');
    await settle();
    await flow.cancel();
    fail(new Error('the save stopped'));
    await running;
    expect(aborted).toEqual(['http://local/1']);
    expect(flow.state.get().kind).toBe('ready');
  });

  it('shows the reason when the save fails', async () => {
    const { flow, fail } = rig();
    flow.start([FILE]);
    await settle();
    const running = flow.run('save');
    await settle();
    fail(new Error('disk full'));
    await running;
    expect(flow.state.get()).toMatchObject({ kind: 'failed' });
  });

  it('shows the reason when preparing fails and can start again', async () => {
    let attempts = 0;
    const flow = new DownloadFlow({
      prepare: (): Promise<PreparedDownload> => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error('offline'))
          : Promise.resolve({ download: download('file', 'a.txt'), url: 'http://local/ok' });
      },
      perform: (): Promise<DownloadOutcome> => Promise.resolve('completed'),
      abort: (): Promise<void> => Promise.resolve(),
    });
    flow.start([FILE]);
    await settle();
    expect(flow.state.get().kind).toBe('failed');
    flow.start([FILE]);
    await settle();
    expect(flow.state.get().kind).toBe('ready');
  });

  it('forgets a result that arrives after the sheet was closed', async () => {
    const { flow } = rig();
    flow.start([FILE]);
    flow.close();
    await settle();
    expect(flow.state.get().kind).toBe('idle');
  });

  it('aborts a running save when the sheet is closed', async () => {
    const { flow, aborted } = rig();
    flow.start([FILE]);
    await settle();
    const running = flow.run('open');
    await settle();
    flow.close();
    await settle();
    expect(aborted).toEqual(['http://local/1']);
    expect(flow.state.get().kind).toBe('idle');
    void running;
  });
});
