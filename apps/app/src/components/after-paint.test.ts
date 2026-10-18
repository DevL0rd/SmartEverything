import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AfterPaint } from './after-paint';

let frames: (() => void)[] = [];
let root: Root | null = null;
const rendered: string[] = [];

function Probe({ name }: { readonly name: string }): null {
  rendered.push(name);
  return null;
}

function nextFrame(): void {
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  });
}

function mount(): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const target = root;
  act(() => {
    target.render(
      createElement(
        Fragment,
        null,
        createElement(Probe, { name: 'first' }),
        createElement(AfterPaint, null, createElement(Probe, { name: 'later' })),
      ),
    );
  });
}

beforeEach(() => {
  rendered.length = 0;
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('AfterPaint', () => {
  it('leaves its children out of the first commit and mounts them on the next frame', () => {
    mount();
    expect(rendered).toEqual(['first']);
    nextFrame();
    expect(rendered).toContain('later');
  });

  it('asks for one frame only', () => {
    mount();
    expect(frames).toHaveLength(1);
    nextFrame();
    expect(frames).toHaveLength(0);
  });
});
