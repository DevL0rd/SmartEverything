import { AI_PREVIEW_ENDPOINTS as E } from '@smarteverything/domain';
import type { PreviewService } from '../../preview/service';
import { bound, type Bound } from '../router';
export function previewDiagnosticRoutes(
  preview: PreviewService,
): Pick<
  Record<keyof typeof E, Bound>,
  'readPreviewLogs' | 'searchPreviewLogs' | 'capturePreviewViewport' | 'clearPreviewWebsiteData'
> {
  return {
    clearPreviewWebsiteData: bound(E.clearPreviewWebsiteData, ({ caller, params, body }) =>
      preview.diagnostics.clear(caller, params.chatId, body),
    ),
    readPreviewLogs: bound(E.readPreviewLogs, ({ caller, params, body }) =>
      preview.diagnostics.read(caller, params.chatId, body),
    ),
    searchPreviewLogs: bound(E.searchPreviewLogs, ({ caller, params, body }) =>
      preview.diagnostics.search(caller, params.chatId, body),
    ),
    capturePreviewViewport: bound(E.capturePreviewViewport, ({ caller, params, body }) =>
      preview.diagnostics.capture(caller, params.chatId, body),
    ),
  };
}
