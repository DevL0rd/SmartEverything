import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURATION } from '../design/motion';
import { useCountUp } from './use-count-up';

let frames: ((now: number) => void)[] = [];
let clock = 0;
let root: Root | null = null;
const shown: string[] = [];

function Counter({ value }: { readonly value: string }): null {
  shown.push(useCountUp(value, true));
  return null;
}

function render(value: string): void {
  act(() => {
    root?.render(createElement(Counter, { value }));
  });
}

function runFrames(): number {
  let count = 0;
  while (frames.length > 0) {
    clock += 1000 / 60;
    const due = frames;
    frames = [];
    act(() => {
      for (const frame of due) frame(clock);
    });
    count += 1;
  }
  return count;
}

beforeEach(() => {
  frames = [];
  clock = 0;
  shown.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('performance', { now: (): number => clock });
  vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void): number =>
    frames.push(callback),
  );
  vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('a figure counting up between two readings', () => {
  it('renders only when the shown text changes, not on every animation frame', () => {
    render('40');
    shown.length = 0;
    render('43');
    const frameCount = runFrames();
    expect(frameCount).toBeGreaterThanOrEqual(Math.floor(DURATION.long / (1000 / 60)));
    expect(shown.at(-1)).toBe('43');
    const distinct = shown.filter((text, index) => text !== shown[index - 1]);
    expect(distinct).toEqual(['40', '41', '42', '43']);
    expect(shown.length).toBe(distinct.length);
  });

  it('keeps every decimal step of a fractional count', () => {
    render('1.0');
    shown.length = 0;
    render('1.3');
    runFrames();
    expect(shown.filter((text, index) => text !== shown[index - 1])).toEqual([
      '1.0',
      '1.1',
      '1.2',
      '1.3',
    ]);
  });
});
