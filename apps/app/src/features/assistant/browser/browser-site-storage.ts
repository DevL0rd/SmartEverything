import { browsableUrl, type BrowserStatus, type BrowserTarget } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { desktopBridge } from '../../../design/platform';
import { Logger, background } from '@smarteverything/logging';
import type { MenuItem } from '../../../components/menu';

const log = new Logger('app.browser-storage');

export function browserSiteStorageAction(
  target: BrowserTarget | undefined,
  status: BrowserStatus,
): MenuItem | null {
  const clear = desktopBridge()?.browser?.clearSiteStorage;
  if (
    clear === undefined ||
    target?.kind !== 'public' ||
    status.id !== target.id ||
    !browsableUrl(status.url) ||
    status.loading
  )
    return null;
  const origin = new URL(status.url).origin;
  return {
    label: 'Clear site storage',
    description: 'Clear saved storage for this site in the built-in browser.',
    icon: 'trash',
    destructive: true,
    onPress: (): void => {
      background(clearSiteStorage(clear, target.id, origin), 'browser.site_storage_clear_failed');
    },
  };
}

async function clearSiteStorage(
  clear: (id: string, origin: string) => Promise<void>,
  id: string,
  origin: string,
): Promise<void> {
  const accepted = await confirm({
    title: 'Clear site storage?',
    body: 'This removes saved page data for this site from the built-in browser.',
    confirmLabel: 'Clear storage',
    tone: 'destructive',
  });
  if (!accepted) return;
  try {
    await clear(id, origin);
    notify({ message: 'Site storage cleared', tone: 'default' });
  } catch (error: unknown) {
    log.error('browser.site_storage_clear_failed', error);
    notify({
      message: 'Could not clear site storage. Check that the same page is still open.',
      tone: 'critical',
    });
  }
}
