import { createElement } from 'react';
import { navEditor } from '../../../app-shell/nav-edit-state';
import { activeLayoutOf, resetNavigation, switchNavScope } from '../../../app-shell/nav-layout';
import type { SettingContext, SettingDefinition } from '../../../settings/types';
import { HiddenNavigationPages, NavigationOrder } from './navigation-rows';
import { NavigationPreview } from './navigation-preview';

const PAGE = 'appearance/navigation';

function writeScope(value: string, context: SettingContext): Promise<void> {
  switchNavScope(context.store, value === 'device' ? 'device' : 'all');
  return Promise.resolve();
}

function openPicker(): Promise<void> {
  navEditor.set({ kind: 'picker' });
  return Promise.resolve();
}

function openFolderEditor(): Promise<void> {
  navEditor.set({ kind: 'folder', members: [] });
  return Promise.resolve();
}

function runReset(context: SettingContext): Promise<void> {
  resetNavigation(context.store);
  return Promise.resolve();
}

export const NAVIGATION_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'navigation.preview',
    page: PAGE,
    title: 'Preview',
    keywords: ['preview', 'bar', 'sidebar'],
    scope: 'client',
    control: 'custom',
    render: () => createElement(NavigationPreview),
  },
  {
    id: 'navigation.scope',
    page: PAGE,
    section: 'Layout',
    title: 'Layout shared with',
    description: 'Your pins and their order follow you to every device, or stay on this one.',
    keywords: ['this device only', 'all my devices', 'sync', 'share', 'per device'],
    scope: 'client',
    control: 'select',
    inline: true,
    options: [
      { value: 'all', label: 'All my devices' },
      { value: 'device', label: 'This device only' },
    ],
    read: (state) => activeLayoutOf(state).scope,
    write: writeScope,
  },
  {
    id: 'navigation.order',
    page: PAGE,
    section: 'Pins and pages',
    title: 'Order',
    keywords: ['order', 'rearrange', 'reorder', 'move', 'pins', 'folders', 'unpin', 'hide'],
    scope: 'client',
    control: 'custom',
    render: () => createElement(NavigationOrder),
  },
  {
    id: 'navigation.add_pin',
    page: PAGE,
    section: 'Pins and pages',
    title: 'Add a pin',
    icon: 'pin',
    keywords: ['pin', 'add', 'shortcut', 'device', 'room', 'camera', 'scene'],
    scope: 'client',
    control: 'action',
    run: openPicker,
  },
  {
    id: 'navigation.new_folder',
    page: PAGE,
    section: 'Pins and pages',
    title: 'New folder',
    icon: 'folder',
    keywords: ['folder', 'group', 'new folder', 'organise'],
    scope: 'client',
    control: 'action',
    run: openFolderEditor,
  },
  {
    id: 'navigation.hidden',
    page: PAGE,
    section: 'Hidden pages',
    title: 'Hidden pages',
    keywords: ['hidden', 'show', 'restore'],
    scope: 'client',
    control: 'custom',
    when: (state) => activeLayoutOf(state).layout.hidden.length > 0,
    render: () => createElement(HiddenNavigationPages),
  },
  {
    id: 'navigation.reset',
    page: PAGE,
    section: 'Reset',
    title: 'Reset navigation',
    icon: 'reset',
    keywords: ['reset', 'default', 'restore', 'undo layout'],
    scope: 'client',
    control: 'action',
    destructive: true,
    run: runReset,
  },
];
