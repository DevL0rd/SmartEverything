import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface FrameProps {
  readonly children?: ReactNode;
  readonly accessibilityRole?: string;
  readonly accessibilityLabel?: string;
}

interface ControlProps extends FrameProps {
  readonly role: string;
  readonly label: string;
  readonly checked?: boolean;
  readonly disabled: boolean;
}

vi.mock('react-native', () => ({
  View: ({ children, accessibilityRole, accessibilityLabel }: FrameProps): ReactNode =>
    createElement('div', { role: accessibilityRole, 'aria-label': accessibilityLabel }, children),
}));
vi.mock('../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('./interactive', () => ({
  Interactive: ({ children, role, label, checked, disabled }: ControlProps): ReactNode =>
    createElement(
      'button',
      { role, 'aria-label': label, 'aria-checked': checked, disabled },
      children,
    ),
}));

const { ColourSwatches } = await import('./colour-swatches');

const OPTIONS = [
  { value: 'blue', label: 'Blue', swatchClassName: 'bg-blue-500' },
  { value: 'violet', label: 'Violet', swatchClassName: 'bg-violet-500' },
];

describe('colour swatches', () => {
  it.each(['blue', 'violet'])('reports only %s as checked', (value) => {
    const markup = renderToStaticMarkup(
      createElement(ColourSwatches, {
        label: 'Accent',
        options: OPTIONS,
        value,
        onChange: vi.fn(),
      }),
    );

    expect(markup).toContain('role="radiogroup" aria-label="Accent"');
    expect(markup).toContain(
      `role="radio" aria-label="Blue" aria-checked="${String(value === 'blue')}"`,
    );
    expect(markup).toContain(
      `role="radio" aria-label="Violet" aria-checked="${String(value === 'violet')}"`,
    );
  });
});
