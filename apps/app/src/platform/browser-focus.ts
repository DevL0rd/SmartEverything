import { Platform } from 'react-native';
type BrowserFocus = 'pane' | 'services' | 'tools';
const openers = new Map<BrowserFocus, HTMLElement>();
export function rememberBrowserFocus(key: BrowserFocus): void {
  if (Platform.OS !== 'web') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) openers.set(key, active);
}
export function restoreBrowserFocus(key: BrowserFocus): void {
  if (Platform.OS !== 'web') return;
  const opener = openers.get(key);
  openers.delete(key);
  if (opener === undefined) return;
  requestAnimationFrame(() => {
    if (opener.isConnected && opener.closest('[aria-hidden="true"]') === null) opener.focus();
  });
}
