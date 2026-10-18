import { browsableUrl, browserAllows, type BrowserTarget } from '@smarteverything/domain';

export type PopupDecision = 'open-tab' | 'load-here' | 'open-externally' | 'refuse';

export function popupDecision(target: BrowserTarget, url: string): PopupDecision {
  if (target.kind === 'public' && browsableUrl(url)) return 'open-tab';
  if (browserAllows(target, url)) return 'load-here';
  return browsableUrl(url) ? 'open-externally' : 'refuse';
}
