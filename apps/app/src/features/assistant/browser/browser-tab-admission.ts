import { closeBrowserSurface } from './browser-runtime';
import { Logger } from '@smarteverything/logging';
import { AI_PREVIEW_LEASE } from '@smarteverything/domain';
import { trustedHubOrigins } from '../../../api/connection/route-consumers';
import { releaseHtmlTarget } from '../../../platform/browser-html-projection';
import { createPreviewLease, openChatPage, releasePreviewLease } from '../data/previews';
import { previewRevisions } from '../../../queries/preview-notices';
import {
  isHtmlPublication,
  chatPageSelection,
  previewSelection,
  type BrowserPublication,
  type BrowserSelection,
} from './browser-selection';
const log = new Logger('app.browser-tabs');
export async function admitBrowserPublication(
  chatId: string,
  publication: BrowserPublication,
): Promise<BrowserSelection> {
  const notice = previewRevisions.get().get(publication.id) ?? 0;
  if (isHtmlPublication(publication)) {
    const { page, target } = await openChatPage(publication);
    return chatPageSelection(publication, page, target, notice);
  }
  const lease = await createPreviewLease(chatId, publication);
  try {
    return previewSelection(
      publication,
      AI_PREVIEW_LEASE.parse(lease),
      notice,
      trustedHubOrigins(),
    );
  } catch (error: unknown) {
    await releasePreviewLease(chatId, lease);
    throw error;
  }
}
export async function retireBrowserSelection(selection: BrowserSelection): Promise<void> {
  closeBrowserSurface(selection.target.id);
  try {
    await releaseHtmlTarget(selection.target);
  } finally {
    if (selection.kind === 'preview')
      await releasePreviewLease(selection.publication.chat_id, selection.lease);
  }
}
export function retireBrowserSelectionQuietly(selection: BrowserSelection): void {
  void retireBrowserSelection(selection).catch((error: unknown) => {
    log.error('tab.retirement_failed', error);
  });
}
