import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WholeActions } from './leaving-card';

vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label, grow }: { readonly label: string; readonly grow?: boolean }): ReactNode =>
    createElement('button', { 'data-grow': grow === true ? 'yes' : 'no' }, label),
}));
vi.mock('../../../components/card', () => ({
  Card: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('section', {}, children),
}));
vi.mock('../../../components/charts/bar-marks', () => ({
  BarLabels: (): null => null,
  BarMarks: (): null => null,
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { readonly width: number; readonly onLayout: () => void } => ({
    width: 0,
    onLayout: () => undefined,
  }),
}));
vi.mock('../../../design/colour', () => ({ useColour: (): string => '#000' }));

const { LeavingCard } = await import('./leaving-card');

function render(actions: Partial<WholeActions>): string {
  const whole: WholeActions = {
    compact: false,
    disabled: false,
    onRestoreAll: () => undefined,
    onDeleteAll: () => undefined,
    ...actions,
  };
  return renderToStaticMarkup(
    createElement(LeavingCard, {
      totals: { count: 214, bytes: 3_100_000_000 },
      months: [{ key: '2026-11', count: 3, critical: true }],
      actions: whole,
    }),
  );
}

describe('Recently deleted leaving card', () => {
  it('shows the count and size beside the bars on wide screens', () => {
    const html = render({});
    expect(html).toContain('In here');
    expect(html).toContain('214 items');
    expect(html).toContain('Leaving for good per month');
    expect(html).toContain('data-grow="no">Restore all');
  });

  it('leaves the count to the title and stretches the actions on phones', () => {
    const html = render({ compact: true });
    expect(html).not.toContain('In here');
    expect(html).toContain('Leaving for good per month');
    expect(html).toContain('data-grow="yes">Restore all');
    expect(html).toContain('data-grow="yes">Delete all now');
  });

  it('never offers Delete all now to a member', () => {
    const html = render({ onDeleteAll: null });
    expect(html).toContain('Restore all');
    expect(html).not.toContain('Delete all now');
  });
});
