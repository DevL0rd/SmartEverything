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
    id: 'menu',
    title: 'Browser options',
    icon: 'ellipsisVertical',
    keywords: ['more', 'three dots', 'preview tools'],
  },
  { id: 'reload', title: 'Reload', icon: 'refresh', keywords: ['refresh preview', 'reload page'] },
  { id: 'copy', title: 'Copy address', icon: 'copy', keywords: ['url', 'link', 'clipboard'] },
] as const satisfies readonly {
  readonly id: string;
  readonly title: string;
  readonly icon: IconName;
  readonly keywords: readonly string[];
}[];
export type BrowserAction = (typeof BROWSER_ACTIONS)[number]['id'];
