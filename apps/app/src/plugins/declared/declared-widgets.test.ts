import { describe, expect, it, vi } from 'vitest';
import type { WidgetDefinition } from '../../components/widget-board';
import { uiRowFixture } from './ui-fixture';

vi.mock('./declared-widget', () => ({ DeclaredWidget: (): null => null }));

const { extensionWidgets } = await import('./declared-widgets');
const { extensionIcon, EXTENSION_FALLBACK_ICON } = await import('./extension-icon');

const KEEP = (type: string): string => type;

describe('extensionWidgets', () => {
  it('keys each widget by its plugin and widget id and groups it under the plugin name', () => {
    const [soil] = extensionWidgets([uiRowFixture()], new Set(), KEEP);
    expect(soil).toMatchObject({
      type: 'garden.soil',
      title: 'Soil',
      icon: 'droplet',
      group: 'Garden',
      defaultSize: 'W',
    });
  });

  it('keeps an id that already starts with the plugin id as it is', () => {
    const types = extensionWidgets([uiRowFixture()], new Set(), KEEP).map((entry) => entry.type);
    expect(types).toStrictEqual(['garden.soil', 'garden-rain']);
  });

  it('offers the declared sizes on every board class', () => {
    const [soil] = extensionWidgets([uiRowFixture()], new Set(), KEEP);
    expect(soil?.sizes).toStrictEqual({
      compact: ['W', 'XL'],
      medium: ['W', 'XL'],
      expanded: ['W', 'XL'],
    });
  });

  it('lets a compiled widget win on the same key', () => {
    const types = extensionWidgets([uiRowFixture()], new Set(['garden-rain']), KEEP).map(
      (entry) => entry.type,
    );
    expect(types).toStrictEqual(['garden.soil']);
  });

  it('lets a compiled widget win through an alias of the extension key', () => {
    const aliases: Readonly<Record<string, string>> = { 'garden.soil': 'garden-soil' };
    const types = extensionWidgets(
      [uiRowFixture()],
      new Set(['garden-soil']),
      (type) => aliases[type] ?? type,
    ).map((entry) => entry.type);
    expect(types).toStrictEqual(['garden-rain']);
  });

  it('gives a widget a puzzle icon when the plugin names an icon the app does not have', () => {
    const rain: WidgetDefinition | undefined = extensionWidgets(
      [uiRowFixture()],
      new Set(),
      KEEP,
    ).find((entry) => entry.type === 'garden-rain');
    expect(rain?.icon).toBe(EXTENSION_FALLBACK_ICON);
    expect(extensionIcon('droplet')).toBe('droplet');
    expect(extensionIcon('no-such-icon')).toBe('puzzle');
  });

  it('has no widgets for a plugin that declares none', () => {
    expect(extensionWidgets([uiRowFixture({ widgets: [] })], new Set(), KEEP)).toStrictEqual([]);
  });
});
