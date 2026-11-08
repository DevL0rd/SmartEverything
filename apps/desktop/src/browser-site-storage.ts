import { BrowserPolicyError, browserAllows, type BrowserTarget } from '@smarteverything/domain';
import type { Session } from 'electron';

export function clearBrowserSiteStorage(
  target: BrowserTarget,
  currentUrl: string,
  origin: string,
  session: Pick<Session, 'clearStorageData'>,
): Promise<void> {
  if (
    target.kind !== 'public' ||
    !browserAllows(target, currentUrl) ||
    new URL(currentUrl).origin !== origin
  )
    throw new BrowserPolicyError(
      'This tab no longer shows the site whose storage you chose to clear.',
    );
  return session.clearStorageData({
    origin,
    storages: ['filesystem', 'indexdb', 'localstorage', 'serviceworkers', 'cachestorage'],
  });
}
