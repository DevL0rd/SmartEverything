import { closeBrowserSurface } from './browser-runtime';
import { Logger } from '@smarteverything/logging';
import {
  AI_PREVIEW_LEASE,
  NATIVE_HTML_LEASE,
  type AiPreviewLease,
  type HtmlPresentationLease,
} from '@smarteverything/domain';
import { trustedHubOrigins } from '../../../api/connection/route-consumers';
import { projectHtmlTarget, releaseHtmlTarget } from '../../../platform/browser-html-projection';
import { createPreviewLease, createHtmlPreviewLease, releasePreviewLease } from '../data/previews';
import { previewRevisions } from '../../../queries/preview-notices';
import {
  htmlSelection,
  isHtmlPublication,
  nativeHtmlSelection,
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
  const lease = isHtmlPublication(publication)
    ? await createHtmlPreviewLease(chatId, publication)
    : await createPreviewLease(chatId, publication);
  try {
    return await authorizeBrowserPublication(publication, lease, notice);
  } catch (error: unknown) {
    await releasePreviewLease(chatId, lease);
    throw error;
  }
}
async function authorizeBrowserPublication(
  publication: BrowserPublication,
  lease: AiPreviewLease | HtmlPresentationLease,
  notice: number,
): Promise<BrowserSelection> {
  if (!isHtmlPublication(publication))
    return previewSelection(
      publication,
      AI_PREVIEW_LEASE.parse(lease),
      notice,
      trustedHubOrigins(),
    );
  if (!('purpose' in lease)) return htmlSelection(publication, lease, notice, trustedHubOrigins());
  const nativeLease = NATIVE_HTML_LEASE.parse(lease);
  const target = await projectHtmlTarget(
    publication.chat_id,
    nativeLease,
    `${publication.id}:${publication.revision}:native:${nativeLease.id}`,
  );
  return nativeHtmlSelection(publication, nativeLease, notice, target);
}
export async function retireBrowserSelection(selection: BrowserSelection): Promise<void> {
  closeBrowserSurface(selection.target.id);
  try {
    await releaseHtmlTarget(selection.target);
  } finally {
    if (selection.kind !== 'public')
      await releasePreviewLease(selection.publication.chat_id, selection.lease);
  }
}
export function retireBrowserSelectionQuietly(selection: BrowserSelection): void {
  void retireBrowserSelection(selection).catch((error: unknown) => {
    log.error('tab.retirement_failed', error);
  });
}
