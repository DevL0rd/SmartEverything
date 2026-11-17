import type { ClipboardClip } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it, vi } from 'vitest';
import { ClipboardSync } from './clipboard-sync';

const FROM = '3f0a1d52-6a37-4c0e-9d3c-8a1c5f7e2b10';

const clip = (text: string): ClipboardClip => ({
  text,
  from: FROM,
  at: '2026-10-18T10:00:00.000Z',
});

class Bench {
  local = '';
  readonly sent: string[] = [];
  readonly written: string[] = [];
  failSend = false;
  readable = true;
  failRead: Error | null = null;
  readonly sync: ClipboardSync;

  constructor(log = new Logger('app.clipboard')) {
    this.sync = new ClipboardSync(
      {
        readLocal: (): Promise<string | null> =>
          this.failRead === null
            ? Promise.resolve(this.readable ? this.local : null)
            : Promise.reject(this.failRead),
        writeLocal: (text): Promise<void> => {
          this.written.push(text);
          this.local = text;
          return Promise.resolve();
        },
        sendRemote: (text): Promise<void> => {
          if (this.failSend) return Promise.reject(new Error('offline'));
          this.sent.push(text);
          return Promise.resolve();
        },
      },
      log,
    );
  }
}

describe('keeping two clipboards in step', () => {
  it('sends what is copied here once, however many times it is reported', async () => {
    const bench = new Bench();
    bench.local = 'from here';
    await bench.sync.localChanged();
    await bench.sync.localChanged();
    await bench.sync.copied('from here');
    expect(bench.sent).toEqual(['from here']);
  });

  it('does not send an empty clipboard', async () => {
    const bench = new Bench();
    await bench.sync.localChanged();
    expect(bench.sent).toEqual([]);
  });

  it('puts text copied on another device on this clipboard, and does not send it back', async () => {
    const bench = new Bench();
    await bench.sync.received(clip('from the laptop'));
    expect(bench.local).toBe('from the laptop');
    await bench.sync.localChanged();
    expect(bench.sent).toEqual([]);
  });

  it('ignores its own copy coming back from the server', async () => {
    const bench = new Bench();
    bench.local = 'mine';
    await bench.sync.localChanged();
    bench.local = 'typed since';
    await bench.sync.received(clip('mine'));
    expect(bench.local).toBe('typed since');
  });

  it('never touches this clipboard when the app opens, resumes or reconnects', async () => {
    const bench = new Bench();
    bench.local = 'what the owner copied before opening the app';
    await bench.sync.foreground();
    await bench.sync.foreground();
    expect(bench.local).toBe('what the owner copied before opening the app');
    expect(bench.written).toEqual([]);
    expect(bench.sent).toEqual([]);
  });

  it('sends what was copied in another app while the app was in the background', async () => {
    const bench = new Bench();
    bench.local = 'already there on open';
    await bench.sync.foreground();
    bench.local = 'copied in another app';
    await bench.sync.foreground();
    await bench.sync.foreground();
    expect(bench.sent).toEqual(['copied in another app']);
    expect(bench.written).toEqual([]);
  });

  it('does not send back a received clip when the app resumes', async () => {
    const bench = new Bench();
    bench.local = 'mine';
    await bench.sync.foreground();
    await bench.sync.received(clip('from the laptop'));
    await bench.sync.foreground();
    expect(bench.written).toEqual(['from the laptop']);
    expect(bench.sent).toEqual([]);
  });

  it('keeps working after a send fails, and sends the same text again next time', async () => {
    const bench = new Bench();
    bench.local = 'important';
    bench.failSend = true;
    await bench.sync.localChanged();
    expect(bench.sent).toEqual([]);
    bench.failSend = false;
    await bench.sync.localChanged();
    expect(bench.sent).toEqual(['important']);
  });

  it('does nothing and reports nothing while the clipboard cannot be read now', async () => {
    const log = new Logger('app.clipboard');
    const error = vi.spyOn(log, 'error');
    const bench = new Bench(log);
    bench.readable = false;
    await bench.sync.foreground();
    await bench.sync.localChanged();
    expect(bench.local).toBe('');
    expect(error).not.toHaveBeenCalled();
  });

  it('reports the real cause when reading the clipboard is refused', async () => {
    const log = new Logger('app.clipboard');
    const error = vi.spyOn(log, 'error');
    const bench = new Bench(log);
    bench.failRead = new DOMException('Document is not focused.', 'NotAllowedError');
    await bench.sync.foreground();
    expect(error).toHaveBeenCalledWith('clipboard.sync_failed', bench.failRead, {
      reason: 'foreground',
    });
  });
});
