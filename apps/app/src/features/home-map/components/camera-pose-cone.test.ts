import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({
  View: stub('View'),
  Platform: { OS: 'web' },
  Dimensions: { get: (): object => ({ width: 1440, height: 900 }), addEventListener: vi.fn() },
}));
vi.mock('react-native-svg', () => ({
  default: stub('Svg'),
  Circle: stub('Circle'),
  Line: stub('Line'),
  Path: stub('Path'),
}));
vi.mock('../../../components/badge', () => ({ Badge: stub('Badge') }));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/number-stepper', () => ({ NumberStepper: stub('NumberStepper') }));
vi.mock('../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../components/switch', () => ({ Switch: stub('Switch') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));

const { CONE_FILL_OPACITY, ConeFigure } = await import('./camera-pose');

const preview = (dashed: boolean): Parameters<typeof ConeFigure>[0]['preview'] => ({
  top: 'M 0 0 Z',
  side: 'M 0 0 Z',
  dashed,
  spoken: 'Camera view',
});

describe('ConeFigure on web, where theme colours are CSS variables', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('draws an unknown direction with the warning variable and a fill opacity', () => {
    expect(() =>
      renderToStaticMarkup(createElement(ConeFigure, { preview: preview(true) })),
    ).not.toThrow();
    const wedges = seen.filter((item) => item.kind === 'Path');
    expect(wedges).toHaveLength(2);
    for (const wedge of wedges) {
      expect(wedge.props['fill']).toBe('var(--color-warning)');
      expect(wedge.props['fillOpacity']).toBe(CONE_FILL_OPACITY);
      expect(wedge.props['stroke']).toBe('var(--color-warning)');
    }
  });

  it('draws a known direction with the primary variable', () => {
    renderToStaticMarkup(createElement(ConeFigure, { preview: preview(false) }));
    const fills = seen.filter((item) => item.kind === 'Path').map((item) => item.props['fill']);
    expect(fills).toEqual(['var(--color-primary)', 'var(--color-primary)']);
  });
});
