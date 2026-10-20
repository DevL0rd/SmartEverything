import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonValue, WidgetBody } from '@smarteverything/domain';
import type { StreamValue } from './stream-value';

const shown = vi.hoisted(
  (): {
    values: Record<string, StreamValue>;
    series: { v: number }[];
    figures: Record<string, unknown>[];
    gauges: Record<string, unknown>[];
    sparks: Record<string, unknown>[];
    empties: Record<string, unknown>[];
    texts: string[];
  } => ({ values: {}, series: [], figures: [], gauges: [], sparks: [], empties: [], texts: [] }),
);

vi.mock('./use-stream-value', () => ({
  useStreamValue: (_plugin: string, ref: { stream: string }): StreamValue =>
    shown.values[ref.stream] ?? { state: 'missing', reason: 'No reading yet.' },
}));
vi.mock('./use-stream-series', () => ({ useStreamSeries: (): unknown => shown.series }));
vi.mock('./controls-view', () => ({
  ControlsView: ({ items }: { readonly items: readonly unknown[] }): string =>
    `controls:${String(items.length)}`,
}));
vi.mock('../../components/figure', () => ({
  Figure: (props: Record<string, unknown>): null => {
    shown.figures.push(props);
    return null;
  },
}));
vi.mock('../../components/charts', () => ({
  Gauge: (props: Record<string, unknown>): null => {
    shown.gauges.push(props);
    return null;
  },
  Sparkline: (props: Record<string, unknown>): null => {
    shown.sparks.push(props);
    return null;
  },
  EmptyGraph: (props: Record<string, unknown>): null => {
    shown.empties.push(props);
    return null;
  },
}));
vi.mock('../../components/text', () => ({
  Text: ({ children }: { readonly children: string }): null => {
    shown.texts.push(children);
    return null;
  },
}));
vi.mock('../../components/widget-board', () => ({ heroFigure: (): string => 'l' }));

const { BodyView } = await import('./body-view');

const AT = '2026-10-18T10:00:00.000Z';

function ready(value: JsonValue): StreamValue {
  return { state: 'ready', value, at: AT };
}

function render(body: WidgetBody): string {
  return renderToStaticMarkup(createElement(BodyView, { pluginId: 'garden', body, size: 'W' }));
}

beforeEach(() => {
  shown.values = {};
  shown.series = [];
  shown.figures.length = 0;
  shown.gauges.length = 0;
  shown.sparks.length = 0;
  shown.empties.length = 0;
  shown.texts.length = 0;
});

describe('BodyView', () => {
  it('shows a figure body as a figure with its caption, never as markup', () => {
    shown.values['soil'] = ready('<script>x</script>');
    render({ type: 'figure', value: { stream: 'soil', field: null }, caption: 'Wetness' });
    expect(shown.figures).toMatchObject([{ value: '<script>x</script>' }]);
    expect(shown.texts).toStrictEqual(['Wetness']);
  });

  it('says why a body has nothing to show instead of a blank or a default', () => {
    render({ type: 'figure', value: { stream: 'soil', field: null }, caption: null });
    expect(shown.figures).toStrictEqual([]);
    expect(shown.texts).toStrictEqual(['No reading yet.']);
  });

  it('draws a gauge body between its declared limits with the reading beside it', () => {
    shown.values['soil'] = ready(61.234);
    render({ type: 'gauge', value: { stream: 'soil', field: null }, min: 0, max: 100 });
    expect(shown.gauges).toMatchObject([{ value: 61.234, min: 0, max: 100 }]);
    expect(shown.figures).toMatchObject([{ value: '61.23' }]);
  });

  it('explains a gauge reading that is not a number', () => {
    shown.values['soil'] = ready('wet');
    render({ type: 'gauge', value: { stream: 'soil', field: null }, min: 0, max: 100 });
    expect(shown.gauges).toStrictEqual([]);
    expect(shown.texts).toStrictEqual(['The reading is not a number.']);
  });

  it('draws a sparkline once there are two readings and waits with an empty graph before', () => {
    const body: WidgetBody = {
      type: 'sparkline',
      value: { stream: 'rain', field: null },
      minutes: 60,
    };
    shown.series = [{ v: 1 }];
    render(body);
    expect(shown.sparks).toStrictEqual([]);
    expect(shown.empties).toMatchObject([{ text: 'Collecting readings' }]);
    shown.series = [{ v: 1 }, { v: 2 }];
    render(body);
    expect(shown.sparks).toHaveLength(1);
    expect(shown.figures).toMatchObject([{ value: '2' }]);
  });

  it('lists titled items up to the limit and says how many more there are', () => {
    shown.values['spots'] = ready(['a', 'b', { title: 'c', detail: 'wet' }, 'd']);
    render({ type: 'list', value: { stream: 'spots', field: null }, limit: 3 });
    expect(shown.texts).toStrictEqual(['a', 'b', 'c', 'wet', '1 more']);
  });

  it('says so for an empty list', () => {
    shown.values['spots'] = ready([]);
    render({ type: 'list', value: { stream: 'spots', field: null }, limit: 3 });
    expect(shown.texts).toStrictEqual(['Nothing to show.']);
  });

  it('hands a controls body to the controls view', () => {
    const html = render({
      type: 'controls',
      items: [{ kind: 'button', label: 'Water', tool: 'water', args: {} }],
    });
    expect(html).toContain('controls:1');
  });
});
