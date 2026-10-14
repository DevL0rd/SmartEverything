import {
  API_ENDPOINTS as E,
  CAPABILITY_KEY,
  capabilityOf,
  isFinished,
  validateCommand,
  type CommandRow,
  type JsonValue,
  type LiveChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../api/transport';
import { notify } from '../components/toast-store';
import type { EntityStore } from './entity-store';
import type { Device, LedgerEntry, StoreState } from './state';
import { sameJson } from './same-json';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.commands');

const EXPIRY_GRACE_MS = 5000;

export type CommandOutcome =
  | { readonly sent: true; readonly row: CommandRow }
  | { readonly sent: false; readonly message: string };

export function slotOf(deviceId: string, capability: string): string {
  return `${deviceId}/${capability}`;
}

function withEntry(state: StoreState, slot: string, entry: LedgerEntry | null): StoreState {
  const others = Object.fromEntries(Object.entries(state.ledger).filter(([key]) => key !== slot));
  return { ...state, ledger: entry === null ? others : { ...others, [slot]: entry } };
}

function failureOf(row: CommandRow): string {
  if (row.status === 'expired') {
    return 'It did not run in time. Is the device reachable?';
  }
  return row.error ?? 'Your server reported a failure without a reason.';
}

function settled(state: StoreState, device: Device, row: CommandRow): StoreState {
  const capability = capabilityOf(device, CAPABILITY_KEY.parse(row.capability));
  if (
    capability === undefined ||
    capability.access === 'write' ||
    capability.value.kind === 'action'
  ) {
    return state;
  }
  const current = state.deviceValues[device.id] ?? {};
  const reported = current[row.capability];
  if (
    reported !== undefined &&
    reported.optimistic !== true &&
    sameJson(reported.value, row.value)
  ) {
    return state;
  }
  const value = {
    value: row.value,
    observedAt: row.finished_at ?? row.created_at,
    optimistic: true,
  } as const;
  return {
    ...state,
    deviceValues: { ...state.deviceValues, [device.id]: { ...current, [row.capability]: value } },
  };
}

export class CommandLedger {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly early = new Map<string, CommandRow>();

  constructor(private readonly store: EntityStore) {}

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  noteChanges(changes: readonly LiveChange[]): void {
    for (const change of changes) {
      if (change.table === 'commands' && change.record !== null) {
        this.note(change.record);
      }
    }
  }

  async send(device: Device, capability: string, value: JsonValue): Promise<CommandOutcome> {
    const slot = slotOf(device.id, capability);
    try {
      const checked = validateCommand(device, {
        capability: CAPABILITY_KEY.parse(capability),
        value,
      });
      this.store.update((state) =>
        withEntry(state, slot, { commandId: null, value: checked, expiresAt: null, failure: null }),
      );
      const row = await api().call(E.sendCommand, {
        body: { device_id: device.id, capability, value: checked },
      });
      this.store.update((state) =>
        withEntry(state, slot, {
          commandId: row.id,
          value: checked,
          expiresAt: row.expires_at,
          failure: null,
        }),
      );
      log.info('command.sent', { commandId: row.id, capability });
      this.follow(device, row);
      return { sent: true, row };
    } catch (error) {
      const message = rawErrorText(error);
      this.store.update((state) =>
        withEntry(state, slot, { commandId: null, value: null, expiresAt: null, failure: message }),
      );
      notify({ message: `${device.label} did not take that`, error, tone: 'critical' });
      log.warn('command.refused', { capability, reason: message });
      return { sent: false, message };
    }
  }

  private follow(device: Device, row: CommandRow): void {
    const early = this.early.get(row.id);
    if (early !== undefined) {
      this.early.delete(row.id);
      this.finish(device, early);
      return;
    }
    const wait = Math.max(0, Date.parse(row.expires_at) - Date.now() + EXPIRY_GRACE_MS);
    this.timers.set(
      row.id,
      setTimeout(() => {
        this.timers.delete(row.id);
        if (this.store.get().ledger[slotOf(device.id, row.capability)]?.commandId === row.id) {
          this.finish(device, { ...row, status: 'expired' });
        }
      }, wait),
    );
  }

  private note(row: CommandRow): void {
    if (row.device_id === null || !isFinished(row.status)) {
      return;
    }
    const state = this.store.get();
    if (state.ledger[slotOf(row.device_id, row.capability)]?.commandId !== row.id) {
      this.early.set(row.id, row);
      if (this.early.size > 100) {
        this.early.delete(this.early.keys().next().value ?? row.id);
      }
      return;
    }
    const device = state.tables.devices.byId[row.device_id];
    if (device !== undefined) {
      this.finish(device, row);
    }
  }

  private finish(device: Device, row: CommandRow): void {
    const slot = slotOf(device.id, row.capability);
    const timer = this.timers.get(row.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(row.id);
    }
    if (row.status === 'succeeded') {
      this.store.update((state) => withEntry(settled(state, device, row), slot, null));
      return;
    }
    const failure = failureOf(row);
    this.store.update((state) =>
      withEntry(state, slot, { commandId: null, value: null, expiresAt: null, failure }),
    );
    notify({ message: `${device.label} did not change`, error: failure, tone: 'critical' });
    log.warn('command.failed', { commandId: row.id, status: row.status });
  }
}
