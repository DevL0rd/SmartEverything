import { Children, createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bodyComposition } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { CompositionGrid } from './composition-grid';

vi.mock('../../components/grid', () => ({
  Grid: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('div', { 'data-cells': Children.count(children) }, children),
}));

function render(impedanceHigh: number | null): string {
  const composition = bodyComposition({
    sex: 'male',
    age: 35,
    heightCm: 180,
    weightKg: 80,
    impedanceLow: 480,
    impedanceHigh,
  });
  return renderToStaticMarkup(createElement(CompositionGrid, { composition }));
}

describe('body composition cells', () => {
  it('allocates cells only for measured metrics', () => {
    const partial = render(null);
    expect(partial).toContain('data-cells="15"');
    expect(partial).not.toContain('ECW ratio');

    const complete = render(520);
    expect(complete).toContain('data-cells="16"');
    expect(complete).toContain('ECW ratio');
  });
});
