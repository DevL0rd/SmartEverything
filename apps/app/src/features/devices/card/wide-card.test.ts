import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import {
  WIDE_MAX_ACTIONS,
  WIDE_MAX_FIGURES,
  WideCard,
  isWideClass,
  type WideCardProps,
  type WideClass,
} from './wide-card';

const mark = (name: string): ReactNode => createElement('i', { key: name, 'data-slot': name });

function html(cls: WideClass, props: Partial<WideCardProps> = {}): string {
  return renderToStaticMarkup(
    createElement(WideCard, {
      cls,
      summary: 'Router, online',
      visual: mark('visual'),
      title: 'Router',
      ...props,
    }),
  );
}

function slots(markup: string, name: string): number {
  return markup.split(`data-slot="${name}"`).length - 1;
}

describe('the wide card scaffold', () => {
  it('is for the four wide frame classes only', () => {
    const classes: readonly FrameClass[] = ['xs', 's', 'm', 'w', 'l', 'xl'];
    expect(classes.map(isWideClass)).toEqual([false, false, true, true, true, true]);
  });

  it('names the card once for screen readers', () => {
    expect(html('m')).toContain('aria-label="Router, online"');
  });

  it.each(['m', 'w', 'l', 'xl'] as const)('draws the visual once at %s', (cls) => {
    expect(slots(html(cls), 'visual')).toBe(1);
  });

  it.each(['m', 'w', 'l', 'xl'] as const)('shows at most the actions that fit at %s', (cls) => {
    const actions = Array.from({ length: 9 }, (_, index) => mark(`action-${String(index)}`));
    const shown = Array.from({ length: 9 }, (_, index) =>
      slots(html(cls, { actions }), `action-${String(index)}`),
    ).reduce((sum, count) => sum + count, 0);
    expect(shown).toBe(WIDE_MAX_ACTIONS[cls]);
  });

  it('shows at most three figures', () => {
    const figures = Array.from({ length: 5 }, (_, index) => mark(`figure-${String(index)}`));
    const shown = Array.from({ length: 5 }, (_, index) =>
      slots(html('m', { figures }), `figure-${String(index)}`),
    ).reduce((sum, count) => sum + count, 0);
    expect(shown).toBe(WIDE_MAX_FIGURES);
  });

  it('collapses empty slots instead of leaving a gap', () => {
    const bare = html('m');
    expect(bare).not.toContain('data-slot="graph"');
    expect(bare).not.toContain('data-slot="ticker"');
  });

  it('keeps the graph hidden from screen readers', () => {
    const withGraph = html('m', { graph: mark('graph') });
    expect(withGraph).toContain('aria-hidden="true"');
    expect(slots(withGraph, 'graph')).toBe(1);
  });

  it('puts the log and ticker only where there is room for them', () => {
    const withTail = html('xl', { log: mark('log'), ticker: mark('ticker') });
    expect(slots(withTail, 'log')).toBe(1);
    expect(slots(withTail, 'ticker')).toBe(1);
    expect(slots(html('m', { log: mark('log') }), 'log')).toBe(0);
  });
});
