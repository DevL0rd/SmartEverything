import { Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
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
