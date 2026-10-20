import type { BottleLogsRepository, StoredUv } from '../../store/repositories/bottle-logs';
import type { LogPages } from './decode';

export interface NewRows {
  readonly uv: readonly StoredUv[];
  readonly faults: readonly { readonly at: number; readonly type: string }[];
}

export function saveLogs(
  logs: Pick<
    BottleLogsRepository,
    'addUv' | 'uv' | 'addBattery' | 'addFault' | 'addState' | 'addAdc'
  >,
  deviceId: string,
  pages: LogPages,
): NewRows {
  const known = new Set(
    pages.activation.length === 0
      ? []
      : logs
          .uv(deviceId, {
            from: Math.min(...pages.activation.map((row) => row.at)),
            to: Math.max(...pages.activation.map((row) => row.at)),
          })
          .map((row) => row.at),
  );
  const uv = pages.activation
    .filter((row) => !known.has(row.at))
    .map((row) => ({ at: row.at, mode: row.mode, socPct: row.socPct }));
  for (const row of uv) {
    logs.addUv(deviceId, row);
    logs.addBattery(deviceId, { at: row.at, pct: Math.min(100, row.socPct), source: 'uv_cycle' });
  }
  const faults = pages.fault.filter((row) => logs.addFault(deviceId, row));
  for (const row of pages.state) {
    logs.addState(deviceId, row);
  }
  for (const row of pages.activation_adc) {
    logs.addAdc(deviceId, 'activation', row);
  }
  for (const row of pages.charging_adc) {
    logs.addAdc(deviceId, 'charging', row);
  }
  return { uv, faults };
}
