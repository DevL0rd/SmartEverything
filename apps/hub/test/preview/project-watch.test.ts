import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewProjectWatch } from '../../src/preview/project-watch';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

let logs: CapturedLogs;
let watch: PreviewProjectWatch;
let directory: string;

beforeEach(async () => {
  logs = captureLogs();
  watch = new PreviewProjectWatch(testLogger('watch'));
  directory = await mkdtemp(join(tmpdir(), 'project-watch-'));
});

afterEach(async () => {
  watch.stop();
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe('a project preview keeps serving when the file watch fails', () => {
  it('logs the failure once and still reloads on explicit change signals', async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    watch.add('page', join(directory, 'missing', 'root'), { changed, touched: vi.fn() });
    expect(logs.events().filter((event) => event === 'project.watch_failed')).toHaveLength(1);
    watch.signal('page', changed);
    await vi.advanceTimersByTimeAsync(200);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('reloads when a watched file changes', async () => {
    const changed = vi.fn();
    watch.add('page', directory, { changed, touched: vi.fn() });
    await writeFile(join(directory, 'index.html'), '<p>edited</p>');
    await vi.waitFor(() => {
      expect(changed).toHaveBeenCalled();
    });
    expect(logs.events()).not.toContain('project.watch_failed');
  });
});
