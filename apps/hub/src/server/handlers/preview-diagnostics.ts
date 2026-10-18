import { AI_PREVIEW_ENDPOINTS as E } from '@smarteverything/domain';
import type { PreviewService } from '../../preview/service';
import { bound } from '../router';
export const previewDiagnosticRoutes = (preview: PreviewService) =>
  ({
    readPreviewErrorRules: bound(E.readPreviewErrorRules, ({ caller, params }) => [
      ...preview.diagnostics.readErrorRules(caller, params.chatId),
    ]),
    ignorePreviewError: bound(E.ignorePreviewError, ({ caller, params, body }) => [
      ...preview.diagnostics.ignoreError(caller, params.chatId, body),
    ]),
    restorePreviewError: bound(E.restorePreviewError, ({ caller, params, body }) => [
      ...preview.diagnostics.restoreError(caller, params.chatId, body),
    ]),
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
  }) as const;
