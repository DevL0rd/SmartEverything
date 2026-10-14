import type { IconName } from '../../../components/icon';
export const BROWSER_ACTIONS = [
  { id: 'new-tab', title: 'New browser tab', icon: 'plus', keywords: ['open tab', 'blank page'] },
  {
    id: 'close-tab',
    title: 'Close browser tab',
    icon: 'close',
    keywords: ['close page', 'remove tab'],
  },
  {
    id: 'tab-earlier',
    title: 'Move tab earlier',
    icon: 'arrowLeft',
    keywords: ['reorder tabs', 'move left'],
  },
  {
    id: 'tab-later',
    title: 'Move tab later',
    icon: 'arrowRight',
    keywords: ['reorder tabs', 'move right'],
  },
  {
    id: 'address',
    title: 'Browser address',
    icon: 'globe',
    keywords: ['url', 'navigate', 'website'],
  },
  {
    id: 'console',
    title: 'Console',
    icon: 'terminal',
    keywords: ['logs', 'errors', 'warnings', 'preview console'],
  },
  {
    id: 'menu',
    title: 'Browser options',
    icon: 'ellipsisVertical',
    keywords: ['more', 'three dots', 'preview tools'],
  },
  { id: 'reload', title: 'Reload', icon: 'refresh', keywords: ['refresh preview', 'reload page'] },
  {
    id: 'capture',
    title: 'Capture preview',
    icon: 'camera',
    keywords: ['screenshot', 'current view', 'capture pixels'],
  },
  { id: 'copy', title: 'Copy address', icon: 'copy', keywords: ['url', 'link', 'clipboard'] },
  {
    id: 'clear-cache',
    title: 'Clear cache',
    icon: 'trash',
    keywords: ['website cache', 'preview data'],
  },
  {
    id: 'clear-storage',
    title: 'Clear website data',
    icon: 'trash',
    keywords: ['local storage', 'session storage', 'reset website', 'website data'],
  },
  {
    id: 'clear-cookies',
    title: 'Clear cookies',
    icon: 'cookie',
    keywords: ['website cookies', 'preview sign out'],
  },
  {
    id: 'search-console',
    title: 'Search console',
    icon: 'search',
    keywords: ['log message', 'stack', 'source', 'find error'],
  },
  {
    id: 'console-level',
    title: 'Console level',
    icon: 'filter',
    keywords: ['severity', 'all levels', 'errors', 'warnings', 'info', 'debug'],
  },
  {
    id: 'older-console',
    title: 'Load older console entries',
    icon: 'clock',
    keywords: ['previous logs', 'earlier', 'cursor'],
  },
  {
    id: 'new-console',
    title: 'New console entries',
    icon: 'arrowDown',
    keywords: ['latest logs', 'tail', 'resume'],
  },
] as const satisfies readonly {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
}[];
export type BrowserAction = (typeof BROWSER_ACTIONS)[number]['id'];
