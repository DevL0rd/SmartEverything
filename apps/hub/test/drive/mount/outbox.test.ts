import { describe, expect, it } from 'vitest';
import { Histogram } from '../../../src/drive/mount/metrics';
import { Outbox, carriesPayload } from '../../../src/drive/mount/outbox';
import { errorFrame, pushFrame, replyFrame } from '../../../src/drive/mount/frames';

const WINDOW = 1024;

function read(id: bigint, bytes: number): Uint8Array {
  return replyFrame('READ', id, {}, new Uint8Array(bytes));
}

function control(id: bigint): Uint8Array {
  return errorFrame(0x10, id, { code: 'ENOENT', message: 'missing' });
}

interface Sent {
  readonly bytes: Uint8Array;
  readonly written: (failure?: Error | null) => void;
}

function wired(): { readonly outbox: Outbox; readonly sent: Sent[]; readonly failures: Error[] } {
  const sent: Sent[] = [];
  const failures: Error[] = [];
  const outbox = new Outbox(
    {
      send: (bytes, written): void => {
        sent.push({ bytes, written });
      },
    },
    (failure) => {
      failures.push(failure);
    },
    WINDOW,
  );
  return { outbox, sent, failures };
}

describe('the mount outbox', () => {
  it('tells payload frames from control frames', () => {
    expect(carriesPayload(read(1n, 4))).toBe(true);
    expect(carriesPayload(control(2n))).toBe(false);
    expect(
      carriesPayload(pushFrame('RESET', { root: '00000000-0000-4000-8000-000000000000', seq: 1 })),
    ).toBe(false);
  });

  it('sends a control frame before queued read payloads', () => {
    const { outbox, sent } = wired();
    const first = read(1n, WINDOW * 4);
    const second = read(2n, WINDOW * 4);
    const answer = control(3n);
    outbox.send(first);
    outbox.send(second);
    outbox.send(answer);
    expect(sent.map((entry) => entry.bytes)).toEqual([first]);
    sent[0]?.written(null);
    expect(sent.map((entry) => entry.bytes)).toEqual([first, answer, second]);
  });

  it('keeps small frames flowing until the window fills', () => {
    const { outbox, sent } = wired();
    for (let id = 1n; id <= 64n; id += 1n) outbox.send(control(id));
    const inWindow = sent.length;
    expect(inWindow).toBeGreaterThan(1);
    expect(inWindow).toBeLessThan(64);
    for (const entry of [...sent]) entry.written();
    expect(sent.length).toBeGreaterThan(inWindow);
  });

  it('reports a failed write once and drops what is queued', () => {
    const { outbox, sent, failures } = wired();
    outbox.send(read(1n, WINDOW * 4));
    outbox.send(read(2n, WINDOW * 4));
    sent[0]?.written(new Error('closed'));
    outbox.send(control(3n));
    expect(failures.map((failure) => failure.message)).toEqual(['closed']);
    expect(sent).toHaveLength(1);
    expect(outbox.queued).toBe(0);
  });
});

describe('the latency histogram', () => {
  it('reports percentiles within one bucket of the recorded values', () => {
    const histogram = new Histogram();
    for (let ms = 1; ms <= 100; ms += 1) histogram.record(ms);
    const summary = histogram.summary();
    expect(summary.count).toBe(100);
    expect(summary.totalMs).toBe(5050);
    expect(summary.maxMs).toBe(100);
    expect(summary.p50Ms).toBeGreaterThanOrEqual(50);
    expect(summary.p50Ms).toBeLessThan(50 * 1.1);
    expect(summary.p99Ms).toBeGreaterThanOrEqual(99);
    expect(summary.p99Ms).toBeLessThanOrEqual(100);
  });

  it('reports zeros when nothing was recorded', () => {
    expect(new Histogram().summary()).toEqual({
      count: 0,
      totalMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    });
  });
});
