import type { PreviewConsoleRecord, PreviewDiagnosticScope } from '@smarteverything/domain';
import { appPlatform } from '../../../design/platform';
import type { PreviewDiagnosticsSnapshot } from './browser-diagnostics-contract';
interface SnapshotState {
  readonly current: PreviewDiagnosticScope | null;
  readonly records: readonly PreviewConsoleRecord[];
  readonly visible: boolean;
  readonly connected: boolean;
  readonly errors: number;
  readonly omitted: number;
  readonly shared: boolean;
  readonly exhaustedBefore: number | null;
  readonly waitForLayout: boolean;
  readonly clearCookies: boolean;
  readonly clearStorage: boolean;
}
export function diagnosticSnapshot(state: SnapshotState): PreviewDiagnosticsSnapshot {
  const available = { kind: 'available' } as const;
  const unavailable = {
    kind: 'unavailable',
    reason: 'The preview is hidden, inactive or disconnected.',
    ...(state.waitForLayout ? { waitForLayout: true } : {}),
  } as const;
  const clearing =
    appPlatform() === 'desktop'
      ? available
      : ({
          kind: 'unavailable',
          reason: 'Android cannot safely clear only the cache for this preview.',
        } as const);
  return {
    console:
      state.current === null
        ? { kind: 'unavailable', reason: 'Waiting for the native preview document.' }
        : {
            kind: 'ready',
            documentId: state.current.documentId,
            epoch: state.current.epoch,
            records: state.records.map((record) => ({ ...record, id: String(record.id) })),
            errors: state.errors,
            previousCursor: previousCursor(state),
            omittedRecords: state.omitted,
            delivery: state.shared ? 'shared' : 'none',
          },
    capture: state.visible && state.connected ? available : unavailable,
    captureCapability: available,
    clearCache: clearing,
    clearStorage: storageSupport(state.clearStorage),
    clearCookies:
      appPlatform() === 'desktop' || state.clearCookies
        ? available
        : {
            kind: 'unavailable',
            reason: 'Cookie clearing requires an owned isolated preview profile.',
          },
  };
}

function previousCursor(state: SnapshotState): string | null {
  const first = state.records.at(0)?.id;
  if (first === undefined || first <= 1) return null;
  return state.exhaustedBefore === null || first > state.exhaustedBefore ? String(first) : null;
}

function storageSupport(available: boolean): PreviewDiagnosticsSnapshot['clearStorage'] {
  if (available) return { kind: 'available' };
  return {
    kind: 'unavailable',
    reason: 'Website data clearing requires an owned profile and a supported WebView provider.',
  };
}
