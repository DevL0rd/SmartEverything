import { Platform } from 'react-native';
type BrowserFocus = 'pane' | 'services' | 'tools';
const openers = new Map<BrowserFocus, HTMLElement>();
export function browserInert(hidden: boolean): { readonly inert?: boolean } {
  return Platform.OS === 'web' ? { inert: hidden } : {};
}

export function rememberBrowserFocus(key: BrowserFocus): void {
  if (Platform.OS !== 'web') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) openers.set(key, active);
  else openers.delete(key);
}

export function restoreBrowserFocus(key: BrowserFocus, fallback?: () => unknown): void {
  if (Platform.OS !== 'web') return;
  const opener = openers.get(key);
  openers.delete(key);
  if (opener === undefined && fallback === undefined) return;
  requestAnimationFrame(() => {
    const target = canRestore(opener) ? opener : fallback?.();
    if (canRestore(target)) target.focus();
  });
}

function canRestore(node: unknown): node is HTMLElement {
  return (
    node instanceof HTMLElement &&
    node.isConnected &&
    node.getClientRects().length > 0 &&
    node.closest('[inert], [aria-hidden="true"]') === null
  );
}
