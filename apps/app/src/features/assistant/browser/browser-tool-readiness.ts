import { browserCoverOwners } from '../../../platform/browser-overlays';
import type { PreviewDiagnostics, PreviewDocument } from './browser-diagnostics-contract';
import { samePreviewDocument } from './browser-diagnostics-scope';
type Readiness =
  | { readonly kind: 'ready' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'refused'; readonly reason: string };
export class PreviewToolUnavailableError extends Error {
  override readonly name = 'PreviewToolUnavailableError';
}
const READINESS_DEADLINE = 3000;
function waitForReadiness(
  read: () => Readiness,
  subscribe: (listener: () => void) => () => void,
  timeout: string,
): Promise<void> {
  const initial = read();
  if (initial.kind === 'ready') return Promise.resolve();
  if (initial.kind === 'refused')
    return Promise.reject(new PreviewToolUnavailableError(initial.reason));
  return new Promise((resolve, reject) => {
    const finish = (state: Readiness): void => {
      if (state.kind === 'waiting') return;
      clearTimeout(timer);
      stop();
      if (state.kind === 'ready') resolve();
      else reject(new PreviewToolUnavailableError(state.reason));
    };
    const timer = setTimeout(() => {
      finish({ kind: 'refused', reason: timeout });
    }, READINESS_DEADLINE);
    const stop = subscribe(() => {
      finish(read());
    });
    finish(read());
  });
}
export function waitForBrowserMenuClose(owner: symbol | null): Promise<void> {
  return waitForReadiness(
    () => {
      const covers = browserCoverOwners.get();
      if (covers.length === 0) return { kind: 'ready' };
      if (owner === null || covers.some((cover) => cover !== owner))
        return {
          kind: 'refused',
          reason: 'The preview is covered by another window. Close it and try again.',
        };
      return { kind: 'waiting' };
    },
    browserCoverOwners.subscribe,
    'The browser options menu did not close. Try again.',
  );
}
function previewReadiness(controller: PreviewDiagnostics, expected: PreviewDocument): Readiness {
  if (browserCoverOwners.get().length > 0)
    return {
      kind: 'refused',
      reason: 'The preview is covered by another window. Close it and try again.',
    };
  const snapshot = controller.read();
  if (snapshot.console.kind === 'unavailable')
    return { kind: 'refused', reason: snapshot.console.reason };
  if (!samePreviewDocument(snapshot.console, expected))
    return { kind: 'refused', reason: 'The initiating preview document changed.' };
  if (snapshot.capture.kind === 'available') return { kind: 'ready' };
  return snapshot.capture.waitForLayout === true
    ? { kind: 'waiting' }
    : { kind: 'refused', reason: snapshot.capture.reason };
}
export function waitForPreviewLayout(
  controller: PreviewDiagnostics,
  expected: PreviewDocument,
): Promise<void> {
  return waitForReadiness(
    () => previewReadiness(controller, expected),
    (listener) => {
      const stops = [controller.subscribe(listener), browserCoverOwners.subscribe(listener)];
      return (): void => {
        for (const stop of stops) stop();
      };
    },
    'The preview did not become visible after its menu closed. Try again.',
  );
}
