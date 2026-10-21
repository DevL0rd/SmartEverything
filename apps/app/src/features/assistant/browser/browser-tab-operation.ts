import { BROWSER_RETIRED_PROBLEM } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { BrowserTabError } from './browser-tab-errors';
import type { BrowserTabId } from './browser-tab-state';
import type { BrowserTabs } from './browser-tabs';
const log = new Logger('app.browser-tabs');
export function browserTabOperation(operation: Promise<void>): void {
  void operation.catch((error: unknown) => {
    log.error('tab.operation_failed', error);
  });
}
export function announcedBrowserTabOperation(operation: Promise<void>): void {
  void operation.catch((error: unknown) => {
    log.error('tab.operation_failed', error);
    notify({
      message: error instanceof Error ? error.message : 'The browser action could not finish.',
      error,
      tone: 'critical',
    });
  });
}
export function openBrowserAddress(
  tabs: Pick<BrowserTabs, 'blank' | 'address' | 'navigate'>,
  address: string,
): void {
  try {
    const id = tabs.blank();
    tabs.address(id, address);
    browserTabOperation(tabs.navigate(id, address));
  } catch (error: unknown) {
    notify({ message: 'A browser tab could not be opened.', error, tone: 'default' });
  }
}

export async function recoverRetiredTab(tabs: BrowserTabs, id: BrowserTabId): Promise<void> {
  const { source } = tabs.tab(id);
  try {
    if (source.kind !== 'project') throw new BrowserTabError(BROWSER_RETIRED_PROBLEM);
    await tabs.renew(id);
  } catch (cause: unknown) {
    if (!tabs.read().tabs.some((tab) => tab.id === id)) return;
    await tabs.unavailable(id, cause instanceof Error ? cause.message : BROWSER_RETIRED_PROBLEM);
  }
}
