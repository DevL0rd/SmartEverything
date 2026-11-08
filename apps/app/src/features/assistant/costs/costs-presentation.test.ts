import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AI_USAGE_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

interface TextProps {
  readonly className?: string;
  readonly tone?: string;
  readonly numberOfLines?: number;
  readonly children: ReactNode;
}

vi.mock('../../../components/text', () => ({
  Text: ({ className, tone, numberOfLines, children }: TextProps): ReactNode =>
    createElement(
      'span',
      { className, 'data-tone': tone, 'data-line-limit': numberOfLines },
      children,
    ),
}));

vi.mock('../../../components/grid', () => ({
  Grid: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));

vi.mock('./cost-card', () => ({
  CostCard: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));

vi.mock('./estimate-note', () => ({ EstimateNote: (): ReactNode => null }));

vi.mock('../../region', () => ({
  useMoney: (): { cost: (micros: number) => string } => ({
    cost: (micros) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        micros / 1_000_000,
      ),
  }),
}));

vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 346,
    onLayout: (): void => undefined,
  }),
}));

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));

const { SummaryTiles } = await import('./costs-summary');
const { Bars } = await import('../../../components/charts/bars');
const { windowOf } = await import('./costs-range');

const window = windowOf({ range: '30d' }, '2026-11-06', 'UTC');
const { from, to, bucket } = window;
const summary = AI_USAGE_ENDPOINTS.readUsageSummary.response.parse({
  totals: {
    from,
    to,
    sum: {
      tokens_in: 0,
      tokens_cached: 0,
      tokens_out: 0,
      tokens_reasoning: 0,
      audio_in_ms: 0,
      audio_out_ms: 0,
      images: 0,
      video_ms: 0,
      count: 66,
      unknown_count: 14,
      cost_micros: 123_456_789_012_345,
      pending_micros: 0,
    },
    by: { work: [], source: [], model: [], profile: [], client: [], chat: [], plugin: [] },
  },
  series: { from, to, bucket, time_zone: 'UTC', split: null, points: [] },
});

describe('costs presentation', () => {
  it('allows the full large amount and missing-cost count to fit inside the summary card', () => {
    const html = renderToStaticMarkup(
      createElement(SummaryTiles, {
        summary,
        window,
        rangeName: '30 days',
        credits: null,
        budget: null,
      }),
    );

    expect(html).toMatch(/class="[^"]*min-w-0 shrink[^"]*">\$123,456,789\.01<\/span>/u);
    expect(html).toContain(
      '<span data-tone="variant">30 days · Known costs only; 14 unavailable</span>',
    );
  });

  it('uses the readable text role for the date and peak labels', () => {
    const html = renderToStaticMarkup(
      createElement(Bars, {
        bars: [{ key: 'first', value: 1, label: 'Nov 6' }],
        colour: 'viz-1',
        label: 'Spend by day',
        formatValue: (value) => `$${String(value)}`,
      }),
    );

    expect(html).toContain('data-tone="variant">$1</span>');
    expect(html).toContain('data-tone="variant" data-line-limit="1">Nov 6</span>');
  });
});
