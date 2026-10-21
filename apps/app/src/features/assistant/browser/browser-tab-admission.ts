import { closeBrowserSurface } from './browser-surfaces';
import { Logger } from '@smarteverything/logging';
import { projectPageTarget, releaseProjectTarget } from '../../../platform/browser-html-projection';
import type { BrowserSelection } from './browser-selection';
const log = new Logger('app.browser-tabs');
export async function admitProjectPage(
  chatId: string,
  path: string,
  id: string,
): Promise<BrowserSelection> {
  const page = { chatId, path };
  return { kind: 'project', page, target: await projectPageTarget(page, id) };
}
export async function retireBrowserSelection(selection: BrowserSelection): Promise<void> {
  closeBrowserSurface(selection.target.id);
  await releaseProjectTarget(selection.target);
}
export function retireBrowserSelectionQuietly(selection: BrowserSelection): void {
  void retireBrowserSelection(selection).catch((error: unknown) => {
    log.error('tab.retirement_failed', error);
  });
}
