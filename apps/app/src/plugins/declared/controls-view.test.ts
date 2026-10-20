import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamValue } from './stream-value';

interface Press {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly failure: string;
}

const ui = vi.hoisted(
  (): {
    values: Record<string, StreamValue>;
    off: string[];
    tables: string[];
    presses: Press[];
    buttons: Record<string, unknown>[];
    switchProps: Record<string, unknown>[];
    sliders: Record<string, unknown>[];
    texts: string[];
  } => ({
    values: {},
    off: [],
    tables: [],
    presses: [],
    buttons: [],
    switchProps: [],
    sliders: [],
    texts: [],
  }),
);

vi.mock('./use-stream-value', () => ({
  useStreamValue: (_plugin: string, ref: { stream: string }): StreamValue =>
    ui.values[ref.stream] ?? { state: 'missing', reason: 'No reading yet.' },
}));
vi.mock('../../store/selectors', () => ({
  useRow: (table: string): unknown => {
    ui.tables.push(table);
    return table === 'plugin_ui' ? { tools_off: ui.off } : null;
  },
}));
vi.mock('../use-plugin-tool', () => ({
  usePluginTool: (): unknown => ({
    run: (tool: string, args: Record<string, unknown>, failure: string): Promise<null> => {
      ui.presses.push({ tool, args, failure });
      return Promise.resolve(null);
    },
  }),
}));
vi.mock('../../components/button', () => ({
  Button: (props: Record<string, unknown>): null => {
    ui.buttons.push(props);
    return null;
  },
}));
vi.mock('../../components/switch', () => ({
  Switch: (props: Record<string, unknown>): null => {
    ui.switchProps.push(props);
    return null;
  },
}));
vi.mock('../../components/slider', () => ({
  Slider: (props: Record<string, unknown>): null => {
    ui.sliders.push(props);
    return null;
  },
}));
vi.mock('../../components/text', () => ({
  Text: ({ children }: { readonly children: string }): null => {
    ui.texts.push(children);
    return null;
  },
}));

const { ControlsView } = await import('./controls-view');

const AT = '2026-10-18T10:00:00.000Z';

function render(items: Parameters<typeof ControlsView>[0]['items']): void {
  renderToStaticMarkup(createElement(ControlsView, { pluginId: 'garden', items }));
}

function pressed(
  props: Record<string, unknown> | undefined,
  name: string,
  ...args: unknown[]
): void {
  const handler = props?.[name];
  if (typeof handler !== 'function') throw new Error(`No ${name} handler`);
  Reflect.apply(handler, undefined, args);
}

beforeEach(() => {
  ui.values = {};
  ui.off = [];
  ui.tables.length = 0;
  ui.presses.length = 0;
  ui.buttons.length = 0;
  ui.switchProps.length = 0;
  ui.sliders.length = 0;
  ui.texts.length = 0;
});

describe('ControlsView', () => {
  it('runs the declared tool with the declared arguments when a button is pressed', () => {
    render([{ kind: 'button', label: 'Water now', tool: 'water', args: { zone: 2 } }]);
    pressed(ui.buttons[0], 'onPress');
    expect(ui.presses).toStrictEqual([
      { tool: 'water', args: { zone: 2 }, failure: 'Water now did not work' },
    ]);
  });

  it('turns a toggle with the declared argument key from the value of its stream', () => {
    ui.values['pump'] = { state: 'ready', value: false, at: AT };
    render([
      {
        kind: 'toggle',
        label: 'Pump',
        tool: 'set_pump',
        args: { zone: 1 },
        value: { stream: 'pump', field: null },
        arg: 'on',
      },
    ]);
    expect(ui.switchProps[0]).toMatchObject({ value: false, disabled: false });
    pressed(ui.switchProps[0], 'onChange', true);
    expect(ui.presses).toStrictEqual([
      { tool: 'set_pump', args: { zone: 1, on: true }, failure: 'Pump did not work' },
    ]);
  });

  it('commits a slider value under its declared argument key', () => {
    ui.values['level'] = { state: 'ready', value: 40, at: AT };
    render([
      {
        kind: 'slider',
        label: 'Flow',
        tool: 'set_flow',
        args: {},
        value: { stream: 'level', field: null },
        arg: 'percent',
        min: 0,
        max: 100,
        step: 5,
      },
    ]);
    expect(ui.sliders[0]).toMatchObject({ value: 40, min: 0, max: 100, step: 5, disabled: false });
    pressed(ui.sliders[0], 'onCommit', 55);
    expect(ui.presses).toStrictEqual([
      { tool: 'set_flow', args: { percent: 55 }, failure: 'Flow did not work' },
    ]);
  });

  it('disables a control whose tool is switched off and says why', () => {
    ui.off = ['water'];
    render([{ kind: 'button', label: 'Water now', tool: 'water', args: {} }]);
    expect(ui.tables).toStrictEqual(['plugin_ui']);
    expect(ui.buttons[0]).toMatchObject({ disabled: true });
    expect(ui.texts).toContain('Switched off in this plugin’s tools.');
  });

  it('disables a toggle and a slider that have no reading and says so', () => {
    render([
      {
        kind: 'toggle',
        label: 'Pump',
        tool: 'set_pump',
        args: {},
        value: { stream: 'pump', field: null },
        arg: 'on',
      },
      {
        kind: 'slider',
        label: 'Flow',
        tool: 'set_flow',
        args: {},
        value: { stream: 'level', field: null },
        arg: 'percent',
        min: 0,
        max: 100,
        step: 5,
      },
    ]);
    expect(ui.switchProps[0]).toMatchObject({ disabled: true });
    expect(ui.sliders[0]).toMatchObject({ disabled: true, value: null });
    expect(ui.texts.filter((text) => text === 'No reading yet.')).toHaveLength(2);
  });
});
