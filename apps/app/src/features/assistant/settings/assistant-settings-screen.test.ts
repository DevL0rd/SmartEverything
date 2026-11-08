import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SettingDefinition, SettingsPageDefinition } from '../../../settings/types';

const platform = vi.hoisted(() => ({ native: false }));

const PAGE: SettingsPageDefinition = {
  id: 'assistant',
  title: 'Assistant settings',
  icon: 'sparkles',
  parent: null,
  group: 'App',
  childrenInline: false,
  keywords: [],
};

function setting(id: string, title: string, section?: string): SettingDefinition {
  return {
    id,
    page: PAGE.id,
    title,
    keywords: [],
    scope: 'client',
    control: 'custom',
    ...(section === undefined ? {} : { section, row: true }),
    render: () => createElement('button', null, title),
  };
}

const SETTINGS = [
  setting('assistant.name', 'Name', 'Assistant'),
  setting('assistant.instructions', 'Instructions', 'Assistant'),
  setting('assistant.wake', 'Test the wake word'),
  setting('assistant.clear', 'Clear history', 'Privacy'),
];

interface ViewProps {
  readonly className?: string;
  readonly children: ReactNode;
}

vi.mock('react-native', () => ({
  View: ({ className, children }: ViewProps): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../../../design/platform', () => ({ isNative: (): boolean => platform.native }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock('../../../components/screen', () => ({ Screen: (): null => null }));
vi.mock('../../../components/rows', () => ({ NavRow: (): null => null }));
vi.mock('../../../components/section', () => ({
  List: ({ title, children }: ViewProps & { readonly title: string }): ReactNode =>
    createElement('section', null, createElement('h2', null, title), children),
}));
vi.mock('../../../settings/custom-screens', () => ({ CUSTOM_SETTINGS_SCREENS: {} }));
vi.mock('../../../settings/env', () => ({ useSettingEnv: (): null => null }));
vi.mock('../../../settings/settings-nav', () => ({ SettingsNav: (): null => null }));
vi.mock('../../../settings/availability', () => ({
  pageReachable: (): boolean => true,
  useBuiltSettingsPages: (): ReadonlySet<string> => new Set([PAGE.id]),
}));
vi.mock('../../../settings/settings-frame', () => ({
  SettingsFrame: ({
    contentWidth = 'reading',
    children,
  }: ViewProps & { readonly contentWidth?: string }): ReactNode =>
    createElement('main', { 'data-width': contentWidth }, children),
}));
vi.mock('../../../settings/tree', () => ({
  childrenOf: (): readonly SettingsPageDefinition[] => [],
  settingsPage: (): SettingsPageDefinition => PAGE,
  onPlatform: (): boolean => true,
}));
vi.mock('../../../settings/registry', () => ({
  settingsOn: (): readonly SettingDefinition[] => SETTINGS,
}));
vi.mock('../../../settings/settings-focus', () => ({ useSettingsFocus: (): void => undefined }));
vi.mock('../../../settings/settings-row', () => ({
  AnchoredSettingRow: ({ setting }: { readonly setting: SettingDefinition }): ReactNode =>
    setting.control === 'custom' ? setting.render() : null,
}));
vi.mock('../../../store/store-context', () => ({
  shallowEqual: (): boolean => true,
  useStoreSelector: (): readonly string[] => SETTINGS.map(({ id }) => id),
}));

const { AssistantSettingsScreen } = await import('./assistant-settings-screen');
const { SettingsPageScreen } = await import('../../../settings/settings-screen');

describe('Assistant settings block layout', () => {
  it('uses the full web pane and keeps each ordered settings block intact and readable', () => {
    const html = renderToStaticMarkup(createElement(AssistantSettingsScreen));
    expect(html).toContain('data-width="full"');
    expect(html).toContain('web:columns-(--spacing-picker)');
    expect(html.match(/max-w-reading web:break-inside-avoid/g)).toHaveLength(3);
    expect(html).toContain(
      '<section><h2>Assistant</h2><button>Name</button><button>Instructions</button></section>',
    );
    expect(html.indexOf('Instructions')).toBeLessThan(html.indexOf('Test the wake word'));
    expect(html.indexOf('Test the wake word')).toBeLessThan(html.indexOf('Clear history'));
  });

  it('keeps the native Assistant and generic settings layouts as one form', () => {
    const defaultPage = renderToStaticMarkup(createElement(SettingsPageScreen, { page: PAGE.id }));
    platform.native = true;
    try {
      const native = renderToStaticMarkup(createElement(AssistantSettingsScreen));
      expect(native).toBe(defaultPage);
      expect(native).toContain('data-width="reading"');
      expect(native).not.toContain('web:columns-');
    } finally {
      platform.native = false;
    }
  });
});
