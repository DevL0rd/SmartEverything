import { AppState } from 'react-native';
import { browserCovered } from '../../../platform/browser-overlays';
import { PREVIEW_VIEW_SCOPE, type PreviewDiagnosticScope } from '@smarteverything/domain';
import type { PreviewViewScope, PreviewDocument } from './browser-diagnostics-contract';
class PreviewDocumentChangedError extends Error {
  override readonly name = 'PreviewDocumentChangedError';
}
export function samePreviewDocument(actual: PreviewDocument, expected: PreviewDocument): boolean {
  return actual.documentId === expected.documentId && actual.epoch === expected.epoch;
}
export function requirePreviewDocument(actual: PreviewDocument, expected: PreviewDocument): void {
  if (!samePreviewDocument(actual, expected))
    throw new PreviewDocumentChangedError('The initiating preview document changed.');
}
export function diagnosticOperationScope(
  current: PreviewDiagnosticScope | null,
  expected?: PreviewDocument,
): PreviewDiagnosticScope {
  if (current === null)
    throw new PreviewDocumentChangedError('Wait for the preview document to load.');
  if (expected !== undefined) requirePreviewDocument(current, expected);
  return current;
}
export function diagnosticScope(scope: PreviewViewScope, epoch: string): PreviewDiagnosticScope {
  const parts = scope.target.id.split(':');
  return PREVIEW_VIEW_SCOPE.parse({
    clientId: scope.clientId,
    profileId: scope.profileId,
    chatId: scope.chatId,
    viewerId: scope.viewerId,
    browserId: scope.target.id,
    documentId:
      scope.target.kind === 'public'
        ? scope.target.id
        : (scope.target.page?.publicationId ?? parts[0]),
    revision: scope.target.kind === 'public' || scope.target.page !== undefined ? null : parts[1],
    epoch,
  });
}

export function diagnosticForeground(disposed: boolean, requested: boolean): boolean {
  return (
    !disposed &&
    requested &&
    !browserCovered.get() &&
    AppState.currentState === 'active' &&
    (typeof document === 'undefined' || document.visibilityState === 'visible')
  );
}
