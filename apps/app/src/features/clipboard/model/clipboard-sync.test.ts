import type { ClipboardClip } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it, vi } from 'vitest';
import { ClipboardSync, decideSync } from './clipboard-sync';

const FROM = '3f0a1d52-6a37-4c0e-9d3c-8a1c5f7e2b10';

const clip = (text: string): ClipboardClip => ({
  text,
  from: FROM,
  at: '2026-10-18T10:00:00.000Z',
});

describe('deciding what to do with two clipboards', () => {
  it('takes the shared text on first contact, since the local text has no known age', () => {
    expect(decideSync('local', clip('shared'), null)).toBe('apply');
  });

  it('sends the local text on first contact when nothing is shared yet', () => {
    expect(decideSync('local', null, null)).toBe('send');
  });

  it('prefers what was copied here since the last sync', () => {
    expect(decideSync('new here', clip('old shared'), 'old shared')).toBe('send');
  });

  it('takes what was copied elsewhere when this one did not change', () => {
    expect(decideSync('same', clip('elsewhere'), 'same')).toBe('apply');
  });

  it('does nothing when both already agree or the local one is empty', () => {
    expect(decideSync('same', clip('same'), null)).toBe('none');
    expect(decideSync('', null, null)).toBe('none');
    expect(decideSync('', clip('shared'), 'shared')).toBe('none');
  });
});

class Bench {
  local = '';
  shared: ClipboardClip | null = null;
  readonly sent: string[] = [];
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
          this.local = text;
          return Promise.resolve();
        },
        readRemote: (): Promise<ClipboardClip | null> => Promise.resolve(this.shared),
        sendRemote: (text): Promise<void> => {
          if (this.failSend) return Promise.reject(new Error('offline'));
          this.sent.push(text);
          this.shared = clip(text);
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

  it('catches up when the app comes to the front', async () => {
    const bench = new Bench();
    bench.shared = clip('copied while away');
    await bench.sync.foreground();
    expect(bench.local).toBe('copied while away');
    bench.local = 'copied in another app';
    await bench.sync.foreground();
    expect(bench.sent).toEqual(['copied in another app']);
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
    bench.shared = clip('elsewhere');
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
