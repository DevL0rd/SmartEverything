import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface FrameProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

vi.mock('react-native', () => ({
  View: ({ children, className }: FrameProps): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('./icon', () => ({ Icon: (): null => null }));
vi.mock('./interactive', () => ({
  Interactive: ({ children, className }: FrameProps): ReactNode =>
    createElement('button', { className }, children),
}));
vi.mock('./text', () => ({
  Text: ({ children }: FrameProps): ReactNode => createElement('span', null, children),
}));

const { Button, ButtonSample } = await import('./button');

describe('button appearance samples', () => {
  it.each([
    ['Filled', 'filled', 'bg-primary'],
    ['Tonal', 'tonal', 'bg-primary-container'],
  ] as const)('shows %s styling as passive content', (label, variant, colour) => {
    const sample = renderToStaticMarkup(createElement(ButtonSample, { label, variant }));
    const button = renderToStaticMarkup(
      createElement(Button, { label, variant, onPress: () => undefined }),
    );
    expect(sample).toContain(label);
    expect(sample).toContain(colour);
    expect(sample).not.toContain('<button');
    expect(button).toContain(colour);
    expect(button).toContain('<button');
  });
});
