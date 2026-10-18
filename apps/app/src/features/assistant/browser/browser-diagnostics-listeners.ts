import { AppState } from 'react-native';
import type { NativeBrowserDiagnostics, NativeBrowserDiagnostic } from '@smarteverything/domain';
import { browserCovered } from '../../../platform/browser-overlays';
import { connectionState } from '../../../api/connection/connection';
interface ListenerPorts {
  readonly native: NativeBrowserDiagnostics;
  readonly event: (event: NativeBrowserDiagnostic) => void;
  readonly change: () => void;
  readonly resume: () => void;
}
export function diagnosticListeners(ports: ListenerPorts): readonly (() => void)[] {
  const stops = [
    ports.native.subscribe(ports.event),
    browserCovered.subscribe(ports.change),
    connectionState.subscribe(ports.resume),
  ];
  const state = AppState.addEventListener('change', ports.change);
  stops.push(() => {
    state.remove();
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', ports.change);
    stops.push(() => {
      document.removeEventListener('visibilitychange', ports.change);
    });
  }
  return stops;
}
