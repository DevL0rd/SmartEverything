import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Idiom } from '../design/tokens';
import type { BottomSheetProps } from './bottom-sheet';
import type { DialogFrameProps } from './dialog-frame';
import { Sheet } from './sheet';

const fixture = vi.hoisted((): { idiom: Idiom } => ({ idiom: 'touch' }));

vi.mock('../design/platform', () => ({ useIdiom: (): Idiom => fixture.idiom }));
vi.mock('./sheet-navigation', () => ({ useSheetSubpage: (): false => false }));
vi.mock('./popover', () => ({ Popover: (): null => null }));
vi.mock('./bottom-sheet', () => ({
  BottomSheet: ({ children, detents }: BottomSheetProps): ReactNode =>
    createElement('div', { 'data-detents': detents.join(',') }, children),
}));
vi.mock('./dialog-frame', () => ({
  DialogFrame: ({ children, kind }: DialogFrameProps): ReactNode =>
    createElement('div', { 'data-kind': kind }, children),
}));

describe('Adaptive sheet', () => {
  it('keeps the declared fit and half/full stops on touch', () => {
    fixture.idiom = 'touch';
    const props = {
      open: true,
      onClose: (): void => undefined,
      title: 'Controls',
      children: 'Body',
    };
    expect(renderToStaticMarkup(createElement(Sheet, { ...props, detents: ['fit'] }))).toContain(
      'data-detents="fit"',
    );
    expect(
      renderToStaticMarkup(createElement(Sheet, { ...props, detents: ['half', 'full'] })),
    ).toContain('data-detents="half,full"');
  });

  it('uses a dialog for the same content on pointer screens', () => {
    fixture.idiom = 'pointer';
    const props = {
      open: true,
      onClose: (): void => undefined,
      title: 'Controls',
      detents: ['half', 'full'],
      children: 'Body',
    } as const;
    const markup = renderToStaticMarkup(createElement(Sheet, props));
    expect(markup).toBe('<div data-kind="dialog">Body</div>');
  });
});
