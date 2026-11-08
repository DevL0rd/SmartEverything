import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WeatherView } from '../data/use-weather';

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { settings: { focus: (): string => '/settings/home/location' } },
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', null, label),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/skeleton', () => ({
  Skeleton: ({
    shape,
    className,
  }: {
    readonly shape: string;
    readonly className?: string;
  }): ReactNode => createElement('div', { 'data-skeleton': shape, className }),
}));
vi.mock('../../../components/text', () => ({
  Text: ({
    children,
    numberOfLines,
  }: {
    readonly children: ReactNode;
    readonly numberOfLines?: number;
  }): ReactNode => createElement('span', { 'data-lines': numberOfLines }, children),
}));
vi.mock('../../../components/widget-board', () => ({ WidgetEmpty: (): null => null }));
vi.mock('../../../store/mutation', () => ({
  useMutationState: (): { readonly busy: boolean } => ({ busy: false }),
}));
vi.mock('../../../api/weather', () => ({ refreshWeather: vi.fn() }));

const { WeatherNotice } = await import('./weather-notice');

function render(view: Exclude<WeatherView, { kind: 'ready' }>): string {
  return renderToStaticMarkup(createElement(WeatherNotice, { view }));
}

describe('weather page notice', () => {
  it('shows the entire failed forecast message and still offers retry', () => {
    const markup = render({ kind: 'failed', reason: 'The fixture rejected the provider payload' });
    expect(markup).toContain('<span>The weather isn’t available right now</span>');
    expect(markup).toContain('Details: The fixture rejected the provider payload');
    expect(markup).toContain('<button>Try again</button>');
  });

  it('lets owners set a missing location and explains what guests can do', () => {
    expect(render({ kind: 'no_location', canSet: true })).toContain(
      '<button>Set location</button>',
    );
    const guest = render({ kind: 'no_location', canSet: false });
    expect(guest).toContain('The home’s owner can set its location in Settings.');
    expect(guest).not.toContain('<button>');
  });

  it('uses the block skeleton’s intrinsic height while loading', () => {
    expect(render({ kind: 'loading' })).toBe('<div data-skeleton="block"></div>');
  });
});
