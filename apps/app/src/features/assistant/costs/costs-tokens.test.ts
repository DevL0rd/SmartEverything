import { describe, expect, it } from 'vitest';
import type { UsageLedgerRow } from '@smarteverything/domain';

const { tokenFactsOf } = await import('./costs-tokens');
const { detailOfRow } = await import('./ledger-format');

describe('token strip', () => {
  it('reports the cached share of the tokens read and the thinking tokens', () => {
    expect(
      tokenFactsOf({
        tokens_in: 4000,
        tokens_out: 600,
        tokens_cached: 3000,
        tokens_reasoning: 250,
      }),
    ).toStrictEqual({ read: 4000, cached: 3000, cacheShare: 0.75, written: 600, thinking: 250 });
  });

  it('has no cache share when nothing was read', () => {
    expect(
      tokenFactsOf({ tokens_in: 0, tokens_out: 0, tokens_cached: 0, tokens_reasoning: 0 })
        .cacheShare,
    ).toBeNull();
  });
});

function row(tokens_reasoning: number): UsageLedgerRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    at: '2026-10-20T10:00:00Z',
    work: 'chat',
    source: 'openrouter',
    cost_micros: 1200,
    cost_state: 'reported',
    tokens_in: 1000,
    tokens_out: 200,
    tokens_reasoning,
    audio_in_ms: 0,
    audio_out_ms: 0,
    images: 0,
    video_ms: 0,
    profile: { id: 'p', label: 'Sam' },
    client: null,
    chat: null,
    model: null,
    plugin: null,
  };
}

describe('ledger row detail', () => {
  it('adds thinking tokens after the existing token line only when there are some', () => {
    expect(detailOfRow(row(0), false)).toBe('1,000 in · 200 out tokens');
    expect(detailOfRow(row(150), false)).toBe('1,000 in · 200 out tokens · 150 thinking');
  });
});
