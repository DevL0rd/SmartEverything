import { useValue } from '../../../design/external-store';
import { browserCovered } from '../../../platform/browser-overlays';
import { restoreBrowserFocus } from '../../../platform/browser-focus';
import { createContext, use, useEffect } from 'react';
export const BrowserActionScope = createContext(true);
export function useBrowserActionScope(): boolean {
  return use(BrowserActionScope);
}

export function useBrowserFocusRestore(scope: Parameters<typeof restoreBrowserFocus>[0]): void {
  const active = useBrowserActionScope();
  const covered = useValue(browserCovered);
  useEffect(() => {
    if (active && !covered) restoreBrowserFocus(scope);
  }, [active, covered, scope]);
}
