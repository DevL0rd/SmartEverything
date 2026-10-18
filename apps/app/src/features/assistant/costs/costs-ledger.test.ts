import { describe, expect, it, vi, type Mock } from 'vitest';
import type { UsageLedgerRow } from '@smarteverything/domain';
import { ledgerSections, retryLedger, type LedgerRetry } from './costs-ledger';
import { windowOf } from './costs-range';

function ledgerOf(data: unknown): LedgerRetry & {
  readonly refetch: Mock<() => Promise<void>>;
  readonly fetchNextPage: Mock<() => Promise<void>>;
} {
  return {
    data,
    refetch: vi.fn(() => Promise.resolve()),
    fetchNextPage: vi.fn(() => Promise.resolve()),
  };
}

describe('retrying the costs ledger', () => {
  it('loads the first page again when it never arrived', () => {
    const ledger = ledgerOf(undefined);
    retryLedger(ledger);
    expect(ledger.refetch).toHaveBeenCalledTimes(1);
    expect(ledger.fetchNextPage).not.toHaveBeenCalled();
  });

  it('asks only for the next page when earlier pages are already shown', () => {
    const ledger = ledgerOf({ pages: [{ rows: [] }], pageParams: [null] });
    retryLedger(ledger);
    expect(ledger.fetchNextPage).toHaveBeenCalledTimes(1);
    expect(ledger.refetch).not.toHaveBeenCalled();
  });
});

describe('the ledger sections and the cost window', () => {
  const row = (id: string, at: string): UsageLedgerRow => ({
    id,
    at,
    work: 'chat',
    source: 'openrouter',
    cost_micros: 0,
    cost_state: 'reported',
    tokens_in: 0,
    tokens_out: 0,
    tokens_reasoning: 0,
    audio_in_ms: 0,
    audio_out_ms: 0,
    images: 0,
    video_ms: 0,
    profile: { id: 'p', label: 'P' },
    client: null,
    chat: null,
    model: null,
    plugin: null,
  });

  it('labels days from the day key alone, with no minute involved', () => {
    const titles = ledgerSections(
      [
        row('a', '2026-10-18T12:00:00Z'),
        row('b', '2026-10-17T12:00:00Z'),
        row('c', '2026-10-10T12:00:00Z'),
      ],
      '2026-10-18',
      'UTC',
    ).map((section) => section.title);
    expect(titles.slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(titles[2]).not.toMatch(/Today|Yesterday/u);
  });

  it('builds the same window for every minute of a day', () => {
    const params = { range: '7d' } as const;
    expect(windowOf(params, '2026-10-18', 'UTC')).toEqual({
      from: '2026-10-12T00:00:00.000Z',
      to: '2026-10-19T00:00:00.000Z',
      firstDay: '2026-10-12',
      lastDay: '2026-10-18',
      days: 7,
      bucket: 'day',
    });
  });
});
