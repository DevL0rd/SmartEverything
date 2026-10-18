import { createElement, useRef, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measurable, useViewport } from './viewport';

function Probe(): ReactNode {
  const ref = useRef(null);
  return createElement('i', { 'data-visible': String(useViewport(ref).visible) });
}

describe('web viewport measurement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is measurable only where an intersection observer and DOM elements exist', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('Element', Object);
    expect(measurable()).toBe(false);
    vi.stubGlobal('IntersectionObserver', Object);
    expect(measurable()).toBe(true);
    vi.stubGlobal('Element', undefined);
    expect(measurable()).toBe(false);
  });

  it('starts out of view where it can measure, so nothing plays before the first measurement', () => {
    vi.stubGlobal('IntersectionObserver', Object);
    vi.stubGlobal('Element', Object);
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-visible="false"');
  });

  it('starts in view where nothing can be measured, so nothing stays hidden forever', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    expect(renderToStaticMarkup(createElement(Probe))).toContain('data-visible="true"');
  });
});
