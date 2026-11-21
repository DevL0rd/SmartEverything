import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Seen {
  presses: ((() => void) | undefined)[];
}

const seen = vi.hoisted((): Seen => ({ presses: [] }));

vi.mock('./interactive', () => ({
  Interactive: ({ onPress }: { readonly onPress?: () => void }): null => {
    seen.presses.push(onPress);
    return null;
  },
}));
vi.mock('./icon', () => ({ Icon: (): null => null }));
vi.mock('./text', () => ({ Text: (): null => null }));
vi.mock('../design/platform', () => ({ useIdiom: (): string => 'pointer' }));

const { FlatChoice } = await import('./flat-choice');

beforeEach(() => {
  seen.presses = [];
});

describe('FlatChoice', () => {
  it('hands its own value to one shared select handler', () => {
    const onSelect = vi.fn();
    for (const value of ['on', 'paused'] as const) {
      renderToStaticMarkup(
        createElement(FlatChoice<'on' | 'paused'>, {
          label: value,
          active: false,
          value,
          onSelect,
        }),
      );
    }
    for (const press of seen.presses) press?.();
    expect(onSelect.mock.calls).toEqual([['on'], ['paused']]);
  });

  it('passes a plain press handler through unchanged', () => {
    const onPress = vi.fn();
    renderToStaticMarkup(createElement(FlatChoice, { label: 'All', active: true, onPress }));
    expect(seen.presses).toEqual([onPress]);
  });
});
