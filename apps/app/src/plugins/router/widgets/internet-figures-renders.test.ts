import { formatMegabits } from '@smarteverything/domain';
import { act, createElement, Profiler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeroModel } from '../overview/hero-model';

vi.mock('../../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: true,
    onLayout: undefined,
  }),
}));

vi.mock(import('../../../design/motion'), async (importOriginal) => ({
  ...(await importOriginal()),
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

vi.mock('../../../components/text', () => ({
  Text: (): ReactNode => null,
}));

vi.mock('../../../components/charts', () => ({
  ProgressBar: (): ReactNode => null,
  Sparkline: (): ReactNode => null,
}));

vi.mock('../../../components/icon', () => ({ Icon: (): ReactNode => null }));

vi.mock('../overview/use-router-series', () => ({
  useMegabitSeries: (): { points: readonly [] } => ({ points: [] }),
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

const { Figures } = await import('./internet-parts');

const FRAME_MS = 1000 / 60;
const STREAM = [
  [212.4, 18.2],
  [208.9, 17.6],
  [215.3, 19.1],
  [221.0, 18.4],
  [209.7, 17.9],
  [213.6, 18.8],
  [218.2, 19.4],
  [211.5, 18.1],
  [207.4, 17.7],
  [214.9, 18.6],
  [219.8, 19.2],
] as const;

let frames: ((now: number) => void)[] = [];
let clock = 0;
let root: Root | null = null;
let commits = 0;

function counted(): void {
  commits += 1;
}

function heroOf(download: number, upload: number): HeroModel {
  const part = (megabits: number): { value: string; unit: string } => {
    const text = formatMegabits(megabits);
    const space = text.lastIndexOf(' ');
    return { value: text.slice(0, space), unit: text.slice(space + 1) };
  };
  return {
    stale: false,
    tone: 'positive',
    title: 'Online',
    figures: [
      { label: 'Download', ...part(download) },
      { label: 'Upload', ...part(upload) },
    ],
    ratio: null,
    ringNote: undefined,
    facts: [],
    spoken: 'Online',
    canRun: true,
  };
}

function tick(download: number, upload: number): void {
  act(() => {
    root?.render(
      createElement(
        Profiler,
        { id: 'figures', onRender: counted },
        createElement(Figures, { hero: heroOf(download, upload), size: 'l' }),
      ),
    );
  });
  const until = clock + 1000;
  while (clock < until) {
    clock += FRAME_MS;
    const due = frames;
    frames = [];
    act(() => {
      for (const frame of due) frame(clock);
    });
  }
}

beforeEach(() => {
  frames = [];
  clock = 0;
  commits = 0;
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

describe('the Internet widget figures on the 1 Hz router stream', () => {
  it('draws each small rate change once instead of counting it up frame by frame', () => {
    const [first, ...rest] = STREAM;
    tick(first[0], first[1]);
    commits = 0;
    for (const [download, upload] of rest) tick(download, upload);
    const perTick = commits / rest.length;
    expect(perTick).toBeLessThanOrEqual(2);
  });
});
