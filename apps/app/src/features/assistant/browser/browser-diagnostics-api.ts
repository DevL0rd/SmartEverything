import type { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { jsonText } from '../../../format/json-text';
import {
  type PREVIEW_CAPTURE_RESULT,
  AI_PREVIEW_ENDPOINTS,
  PREVIEW_LOG_PAGE,
  PREVIEW_VIEW_RESPONSE,
  type PreviewLogPage,
  type PreviewDiagnosticScope,
  type PreviewRecordRefusal,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { PreviewViewScope } from './browser-diagnostics-contract';

const log = new Logger('app.preview-diagnostics');
export function parseViewResponse(data: unknown): z.infer<typeof PREVIEW_VIEW_RESPONSE> | null {
  const json = typeof data === 'string' ? jsonText(data) : null;
  const parsed = json?.ok === true ? PREVIEW_VIEW_RESPONSE.safeParse(json.value) : null;
  if (parsed?.success === true) return parsed.data;
  log.warn('preview.message_ignored', {});
  return null;
}

function viewer(
  scope: PreviewViewScope,
  current: PreviewDiagnosticScope,
): {
  readonly viewerId: string;
  readonly clientId: string;
  readonly browserId: string;
  readonly epoch: string;
} {
  return {
    viewerId: scope.viewerId,
    clientId: scope.clientId,
    browserId: scope.target.id,
    epoch: current.epoch,
  };
}
export async function readOlderPreviewRecords(
  scope: PreviewViewScope,
  current: PreviewDiagnosticScope,
  cursor: string,
): Promise<PreviewLogPage> {
  return PREVIEW_LOG_PAGE.parse(
    await api().call(AI_PREVIEW_ENDPOINTS.readPreviewLogs, {
      params: { chatId: scope.chatId },
      body: {
        ...viewer(scope, current),
        cursor: Number(cursor),
        direction: 'before',
        limit: 100,
        byteLimit: 65536,
      },
    }),
  );
}
export async function clearBrowserData(
  scope: PreviewViewScope,
  current: PreviewDiagnosticScope,
  action: 'clear-cache' | 'clear-cookies' | 'clear-storage',
): Promise<void> {
  await api().call(AI_PREVIEW_ENDPOINTS.clearPreviewWebsiteData, {
    params: { chatId: scope.chatId },
    body: { ...viewer(scope, current), action },
  });
}

export function captureBrowserViewport(
  scope: PreviewViewScope,
  current: PreviewDiagnosticScope,
): Promise<z.infer<typeof PREVIEW_CAPTURE_RESULT>> {
  return api().call(AI_PREVIEW_ENDPOINTS.capturePreviewViewport, {
    params: { chatId: scope.chatId },
    body: viewer(scope, current),
  });
}

export function browserRecordMetadata(
  final: boolean,
  lastRecordId: number,
  refusedRecords: readonly PreviewRecordRefusal[],
): { readonly lastRecordId?: number; readonly refusedRecords?: readonly PreviewRecordRefusal[] } {
  return final ? { lastRecordId, refusedRecords } : {};
}
