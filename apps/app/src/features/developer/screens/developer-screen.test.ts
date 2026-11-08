import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SettingsFrameProps } from '../../../settings/settings-frame';
import type { SettingDefinition } from '../../../settings/types';

const fixture = vi.hoisted(() => ({ developer: false }));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('expo-router', () => ({ Redirect: (): null => null }));
vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../components/rows', () => ({ NavRow: (): null => null }));
vi.mock('../../../components/section', () => ({ List: childrenOf, Section: childrenOf }));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../settings/env', () => ({
  useSettingEnv: (): { readonly owner: boolean; readonly developer: boolean; readonly platform: 'web' } => ({
    owner: true,
    developer: fixture.developer,
    platform: 'web',
  }),
}));
vi.mock('../../../settings/settings-focus', () => ({ useSettingsFocus: vi.fn() }));
vi.mock('../../../settings/settings-frame', () => ({
  SettingsFrame: ({ contentWidth, children }: SettingsFrameProps): ReactNode =>
    createElement('main', { 'data-content-width': contentWidth }, children),
}));
vi.mock('../../../settings/settings-row', () => ({
  AnchoredSettingRow: ({ setting }: { readonly setting: SettingDefinition }): ReactNode =>
    createElement('span', { 'data-setting': setting.id }),
}));
vi.mock('../../../settings/tree', () => ({ pageHref: (): string => '/settings/developer/logs' }));
vi.mock('../components/ai-repair-inbox', () => ({ AiRepairInbox: (): null => null }));
vi.mock('../components/ai-repair-row', () => ({
  AiRepairRow: (): null => null,
  AI_REPAIR_DESCRIPTION: 'AI repair',
  AI_REPAIR_TITLE: 'Investigate new errors automatically',
}));
vi.mock('../components/developer-rows', () => ({
  DeveloperModeRow: (): null => null,
  LogLevelRow: (): null => null,
  ProfilingHeader: (): null => null,
  ProfilingOption: (): null => null,
  ReloadRow: (): null => null,
  WatchCaptureToggleRow: (): null => null,
}));
vi.mock('../components/ship-level-rows', () => ({ ShipLevelRow: (): null => null }));
vi.mock('../components/watch-capture-rows', () => ({ WatchCaptureClearRow: (): null => null }));

const { DeveloperScreen } = await import('./developer-screen');

describe('Developer screen layout', () => {
  it('keeps diagnostics and investigations ahead of optional tools in the full detail pane', () => {
    fixture.developer = true;
    const html = renderToStaticMarkup(createElement(DeveloperScreen));
    const repair = html.indexOf('developer.error-investigations');
    const logs = html.indexOf('developer.log-level');
    expect(html).toContain('data-content-width="full"');
    expect(repair).toBeGreaterThan(-1);
    expect(logs).toBeGreaterThan(repair);
    expect(html).toContain('developer.perf.sampling');
    expect(html).toContain('developer.reload');
  });

  it('keeps AI repair available with developer mode off', () => {
    fixture.developer = false;
    const html = renderToStaticMarkup(createElement(DeveloperScreen));
    expect(html).toContain('developer.error-investigations');
    expect(html).not.toContain('developer.log-level');
    expect(html).not.toContain('developer.reload');
  });
});
