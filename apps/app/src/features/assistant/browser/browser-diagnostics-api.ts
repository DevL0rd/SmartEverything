import { connectionState } from '../../../api/connection/connection';
import { serverSupportsBrowserData } from '../../../api/connection/server-capabilities';
import { notify } from '../../../components/toast-store';
import type { z } from 'zod';
import {
  legacyConsoleRecords,
  type PREVIEW_CAPTURE_RESULT,
  AI_PREVIEW_ENDPOINTS,
  PREVIEW_LOG_PAGE,
  type PreviewLogPage,
  type PreviewDiagnosticScope,
  type PreviewRecordRefusal,
  type PreviewConsoleRecord,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { PreviewViewScope } from './browser-diagnostics-contract';

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
        ...(browserDataSupported() ? { diagnosticsVersion: 2 as const } : {}),
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

export function browserDataSupported(): boolean {
  const connection = connectionState.get();
  return connection.status === 'paired' && serverSupportsBrowserData(connection.connection.url);
}
export function browserRecordMetadata(
  final: boolean,
  lastRecordId: number,
  refusedRecords: readonly PreviewRecordRefusal[],
): { readonly lastRecordId?: number; readonly refusedRecords?: readonly PreviewRecordRefusal[] } {
  return final && browserDataSupported() ? { lastRecordId, refusedRecords } : {};
}
export function transferableConsoleRecords(records: readonly PreviewConsoleRecord[]): boolean {
  if (browserDataSupported() || legacyConsoleRecords(records)) return true;
  notify({
    message:
      'Update the hub to transfer these full raw console entries. The batch was refused; its text remains unchanged in this browser.',
    tone: 'critical',
  });
  return false;
}
