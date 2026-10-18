import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useMeasuredWidth } from './use-measured-width';

function Probe({ initial }: { readonly initial?: number }): ReactNode {
  const { width } = useMeasuredWidth(Math.round, initial);
  return createElement('i', null, String(width));
}

describe('measured width seed', () => {
  it('starts at zero until a layout arrives', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<i>0</i>');
  });

  it('starts at the width the parent already knows, so the first pass uses the final layout', () => {
    expect(renderToStaticMarkup(createElement(Probe, { initial: 412 }))).toBe('<i>412</i>');
  });
});
