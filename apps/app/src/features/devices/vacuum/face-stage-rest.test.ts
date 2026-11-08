import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface ViewProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: Readonly<Record<string, number>>;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children, className, style }: ViewProps): ReactNode =>
    createElement('div', { className, style }, children),
}));

const { StageFrame } = await import('./face-stage');
const { WIDE_VISUAL_PX } = await import('../card/wide-card');

function frame(slot: 'm' | 'w' | 'stack' | 'side', resting: boolean): string {
  const props: ComponentProps<typeof StageFrame> = {
    slot,
    resting,
    progress: null,
    tone: 'primary',
    children: 'art',
  };
  return renderToStaticMarkup(createElement(StageFrame, props));
}

describe('the resting vacuum art', () => {
  it.each([
    ['m', WIDE_VISUAL_PX.m],
    ['w', WIDE_VISUAL_PX.w],
    ['stack', WIDE_VISUAL_PX.xl],
    ['side', WIDE_VISUAL_PX.xl],
  ] as const)('is the shared tier square, top-aligned, at %s', (slot, px) => {
    const markup = frame(slot, true);
    expect(markup).toContain(`width:${String(px)}px`);
    expect(markup).toContain(`height:${String(px)}px`);
    expect(markup).toContain('self-start');
    expect(markup).not.toContain('self-center');
  });

  it('keeps the full stage for the awake map', () => {
    const markup = frame('w', false);
    expect(markup).toContain('self-stretch');
    expect(markup).not.toContain('width:');
  });
});
