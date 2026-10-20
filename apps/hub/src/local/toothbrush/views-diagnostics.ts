import type { BrushView, DeviceRow } from '@smarteverything/domain';
import type { Viewer } from './access';
import { entryProfileOf } from './config';
import type { DeviceState } from './fleet';
import type { ViewDeps } from './view-deps';
import { viewContextOf } from './views-care';

export function diagnosticsView(
  deps: ViewDeps,
  device: DeviceRow,
  state: DeviceState,
  viewer: Viewer,
): BrushView {
  const holder = deps.holder(device);
  return {
    view: 'diagnostics',
    profile: entryProfileOf(state.entry),
    link: {
      phase: state.link.phase,
      holderName: holder?.clientName ?? null,
      holderIsYou: holder?.clientId === viewer.clientId,
      rssi: state.link.rssi,
      lastHeardAt: state.link.heardAt,
      detail: state.link.detail,
      fetching: state.fetching.size,
    },
    brand: state.runtime.brand.diagnostics(viewContextOf(deps, device, state)),
    rawLog: { enabled: state.rawLogging, frames: [...state.rawLog] },
  };
}
