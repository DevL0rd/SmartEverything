import { describe, expect, it } from 'vitest';
import {
  BOARD_WIDGET,
  BOARD_WIDGET_TYPE,
  OWNER_TABLES,
  TABLE_AREAS,
  TABLE_ROWS,
  WIDGET_KEY,
  WIDGET_TYPE,
} from '../src';
import { pluginAdds } from '../src/plugin-powers';
import {
  PLUGIN_MANIFEST,
  PLUGIN_PAGE,
  PLUGIN_UI_ROW,
  WIDGET_BODY,
  WIDGET_SPEC,
  parsePluginPageRoute,
  pluginPageRoute,
  pluginWidgetType,
} from '../src/plugins';

const FIGURE = { type: 'figure', value: { stream: 'level' }, caption: null } as const;

function page(sections: number): Record<string, unknown> {
  return {
    id: 'overview',
    title: 'Overview',
    icon: 'gauge',
    sections: Array.from({ length: sections }, (_, index) => ({
      title: `Section ${String(index)}`,
      body: FIGURE,
    })),
  };
}

function manifest(
  extra: Readonly<Record<string, unknown>>,
): ReturnType<typeof PLUGIN_MANIFEST.parse> {
  return PLUGIN_MANIFEST.parse({
    id: 'sample',
    name: 'Sample',
    version: '1.0.0',
    description: 'A sample',
    publisher: 'Home',
    ...extra,
  });
}

describe('PLUGIN_PAGE', () => {
  it('accepts a page with one to twelve sections', () => {
    expect(PLUGIN_PAGE.safeParse(page(1)).success).toBe(true);
    expect(PLUGIN_PAGE.safeParse(page(12)).success).toBe(true);
  });

  it('rejects a page with no section or thirteen sections', () => {
    expect(PLUGIN_PAGE.safeParse(page(0)).success).toBe(false);
    expect(PLUGIN_PAGE.safeParse(page(13)).success).toBe(false);
  });

  it('rejects a section that carries anything but a declared body', () => {
    const html = { ...page(1), sections: [{ title: 'Raw', body: { type: 'html', value: '<b>' } }] };
    expect(PLUGIN_PAGE.safeParse(html).success).toBe(false);
  });

  it('allows at most ten pages in a manifest', () => {
    const pages = (count: number): Record<string, unknown>[] =>
      Array.from({ length: count }, (_, index) => ({ ...page(1), id: `page-${String(index)}` }));
    expect(manifest({ contributes: { pages: pages(10) } }).contributes.pages).toHaveLength(10);
    expect(() => manifest({ contributes: { pages: pages(11) } })).toThrow();
  });
});

describe('a stream reference', () => {
  const ref = (field: unknown): boolean =>
    WIDGET_BODY.safeParse({ type: 'figure', value: { stream: 'level', field }, caption: null })
      .success;

  it('names a field of the reading or a dotted path through it, in the reading’s own case', () => {
    expect(ref('wetness')).toBe(true);
    expect(ref('summary.peersOnline')).toBe(true);
    expect(ref(null)).toBe(true);
  });

  it('refuses anything that is not a field path', () => {
    expect(ref('')).toBe(false);
    expect(ref('.summary')).toBe(false);
    expect(ref('summary.')).toBe(false);
    expect(ref('two words')).toBe(false);
    expect(ref('a'.repeat(81))).toBe(false);
  });
});

describe('WIDGET_BODY', () => {
  it('has no map body any more', () => {
    expect(WIDGET_BODY.safeParse({ type: 'map', value: { stream: 'where' } }).success).toBe(false);
  });

  it('keeps the figure, gauge, sparkline, list and controls bodies', () => {
    expect(WIDGET_BODY.options.map((option) => option.shape.type.value)).toStrictEqual([
      'figure',
      'gauge',
      'sparkline',
      'list',
      'controls',
    ]);
  });
});

describe('WIDGET_SPEC sizes', () => {
  it('only knows wide and double-wide sizes', () => {
    const spec = WIDGET_SPEC.parse({
      id: 'level',
      title: 'Level',
      icon: 'gauge',
      sizes: ['M', 'W', 'XL'],
      body: FIGURE,
    });
    expect(spec.sizes).toStrictEqual(['M', 'W', 'XL']);
    expect(
      WIDGET_SPEC.safeParse({
        id: 'level',
        title: 'Level',
        icon: 'gauge',
        sizes: ['Q'],
        body: FIGURE,
      }).success,
    ).toBe(false);
  });
});

describe('pluginWidgetType', () => {
  it('qualifies a widget id with its plugin id', () => {
    expect(pluginWidgetType('sample', 'level')).toBe('sample.level');
  });

  it('keeps a widget id that already starts with its plugin id', () => {
    expect(pluginWidgetType('router', 'router-internet')).toBe('router-internet');
    expect(pluginWidgetType('discord', 'discord.call')).toBe('discord.call');
  });

  it('does not treat a longer plugin name as the plugin itself', () => {
    expect(pluginWidgetType('router', 'routers')).toBe('router.routers');
  });

  it('always fits a board layout, a chat board and a widget key, even at the longest ids', () => {
    const longest = pluginWidgetType('a'.repeat(32), `w${'x'.repeat(79)}`);
    expect(WIDGET_TYPE.safeParse(longest).success).toBe(true);
    expect(BOARD_WIDGET_TYPE.safeParse(longest).success).toBe(true);
    expect(WIDGET_KEY.safeParse(longest).success).toBe(true);
    expect(BOARD_WIDGET.safeParse({ key: longest, type: longest, size: 'W' }).success).toBe(true);
  });
});

describe('pluginPageRoute', () => {
  it('names a plugin page for the navigation pins', () => {
    expect(pluginPageRoute('sample', 'overview')).toBe('plugin.sample.overview');
  });
});

describe('parsePluginPageRoute', () => {
  it('reads back the plugin and page of a route key', () => {
    expect(parsePluginPageRoute(pluginPageRoute('sample', 'overview'))).toStrictEqual({
      pluginId: 'sample',
      pageId: 'overview',
    });
    expect(parsePluginPageRoute('plugin.sample.more.detail')).toStrictEqual({
      pluginId: 'sample',
      pageId: 'more.detail',
    });
  });

  it('refuses anything that is not a plugin page route key', () => {
    expect(parsePluginPageRoute('fitness-sleep')).toBeNull();
    expect(parsePluginPageRoute('plugin.sample')).toBeNull();
    expect(parsePluginPageRoute('plugin.Bad.page')).toBeNull();
    expect(parsePluginPageRoute('plugin.sample.')).toBeNull();
  });
});

describe('pluginAdds', () => {
  it('counts pages with the right singular or plural', () => {
    expect(pluginAdds(manifest({ contributes: { pages: [page(1)] } }))).toStrictEqual(['1 page']);
    expect(
      pluginAdds(manifest({ contributes: { pages: [page(1), { ...page(2), id: 'more' }] } })),
    ).toStrictEqual(['2 pages']);
  });
});

describe('the plugin_ui live table', () => {
  it('is served to members and not to owners only', () => {
    expect(OWNER_TABLES.has('plugin_ui')).toBe(false);
    expect(OWNER_TABLES.has('plugins')).toBe(true);
  });

  it('belongs to the plugins area like the streams', () => {
    expect(TABLE_AREAS.plugin_ui).toBe('plugins');
    expect(TABLE_ROWS.plugin_ui).toBe(PLUGIN_UI_ROW);
  });

  it('keeps only layout fields and drops anything else a row is given', () => {
    const parsed = PLUGIN_UI_ROW.parse({
      id: 'sample',
      name: 'Sample',
      icon_url: null,
      widgets: [],
      pages: [],
      tools_off: ['water'],
      settings: { token: 'x' },
    });
    expect(Object.keys(parsed).sort()).toStrictEqual([
      'icon_url',
      'id',
      'name',
      'pages',
      'tools_off',
      'widgets',
    ]);
  });
});
