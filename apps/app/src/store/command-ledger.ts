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
import type { Device, DeviceValue, LedgerEntry, StoreState } from './state';
import { sameJson } from './same-json';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.commands');

const EXPIRY_GRACE_MS = 5000;

function elapsedSince(startedAt: string | undefined): number | null {
  const started = startedAt === undefined ? Number.NaN : Date.parse(startedAt);
  return Number.isNaN(started) ? null : Date.now() - started;
}

function sentFields(row: CommandRow): Record<string, string> {
  return { commandId: row.id, status: row.status, expiresAt: row.expires_at };
}

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

function authoritative(reported: DeviceValue | undefined, row: CommandRow): boolean {
  return (
    reported !== undefined &&
    (sameJson(reported.value, row.value) ||
      (reported.optimistic !== true &&
        Date.parse(reported.observedAt) >= Date.parse(row.started_at ?? row.created_at)))
  );
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
  const current = state.deviceValues.get(device.id) ?? {};
  const reported = current[row.capability];
  if (authoritative(reported, row)) return state;
  const value = {
    value: row.value,
    observedAt: row.started_at ?? row.created_at,
    optimistic: true,
  } as const;
  return {
    ...state,
    deviceValues: state.deviceValues.set(device.id, { ...current, [row.capability]: value }),
  };
}

export class CommandLedger {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly early = new Map<string, CommandRow>();
  private readonly requests = new Map<string, symbol>();
  private stopped = false;

  constructor(private readonly store: EntityStore) {}

  stop(): void {
    log.info('ledger.stopped', {
      timers: this.timers.size,
      early: this.early.size,
      slots: this.requests.size,
    });
    this.stopped = true;
    this.requests.clear();
    this.early.clear();
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

  noteSnapshot(rows: readonly CommandRow[]): void {
    if (this.stopped) return;
    for (const row of rows) {
      if (
        row.device_id !== null &&
        this.store.get().ledger[slotOf(row.device_id, row.capability)]?.commandId === row.id
      )
        this.note(row);
    }
  }

  async send(device: Device, capability: string, value: JsonValue): Promise<CommandOutcome> {
    const where = { deviceId: device.id, capability };
    if (this.stopped) {
      log.warn('command.refused', { ...where, step: 'ledger', reason: 'ledger_stopped' });
      return { sent: false, message: 'This home connection has closed.' };
    }
    const slot = slotOf(device.id, capability);
    const request = Symbol();
    const superseding = this.requests.has(slot);
    this.requests.set(slot, request);
    const requestedAt = new Date().toISOString();
    let step = 'validate';
    log.debug('command.sending', () => ({ ...where, superseding }));
    try {
      const checked = validateCommand(device, {
        capability: CAPABILITY_KEY.parse(capability),
        value,
      });
      this.pend(slot, checked, requestedAt);
      step = 'api';
      const row = await api().call(E.sendCommand, {
        body: { device_id: device.id, capability, value: checked },
      });
      const latencyMs = elapsedSince(requestedAt);
      if (this.requests.get(slot) !== request) {
        this.early.delete(row.id);
        log.debug('command.superseded', () => ({ ...where, commandId: row.id, latencyMs }));
        return { sent: true, row };
      }
      this.accept(slot, row, checked, requestedAt);
      log.info('command.sent', { ...where, ...sentFields(row), latencyMs });
      this.follow(device, row);
      return { sent: true, row };
    } catch (error) {
      const message = rawErrorText(error);
      if (this.requests.get(slot) === request) this.reject(slot, message);
      notify({ message: `${device.label} did not take that`, error, tone: 'critical' });
      log.warn('command.refused', {
        ...where,
        step,
        reason: message,
        latencyMs: elapsedSince(requestedAt),
      });
      return { sent: false, message };
    }
  }

  private pend(slot: string, value: JsonValue, requestedAt: string): void {
    this.store.update((state) =>
      withEntry(state, slot, {
        commandId: null,
        value,
        expiresAt: null,
        failure: null,
        requestedAt,
      }),
    );
  }

  private reject(slot: string, failure: string): void {
    this.store.update((state) =>
      withEntry(state, slot, { commandId: null, value: null, expiresAt: null, failure }),
    );
  }

  private accept(slot: string, row: CommandRow, value: JsonValue, requestedAt: string): void {
    this.store.update((state) =>
      withEntry(state, slot, {
        requestedAt,
        commandId: row.id,
        value,
        expiresAt: row.expires_at,
        failure: null,
      }),
    );
  }

  private follow(device: Device, row: CommandRow): void {
    const known = this.store.get().tables.commands.byId[row.id];
    if (known !== undefined && isFinished(known.status)) {
      this.finish(device, known);
      return;
    }
    const early = this.early.get(row.id);
    if (early !== undefined) {
      this.early.delete(row.id);
      this.finish(device, early);
      return;
    }
    const wait = Math.max(0, Date.parse(row.expires_at) - Date.now() + EXPIRY_GRACE_MS);
    log.debug('command.following', { commandId: row.id, deviceId: device.id, waitMs: wait });
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
      log.debug('command.noted_early', {
        commandId: row.id,
        deviceId: row.device_id,
        capability: row.capability,
        status: row.status,
      });
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
    const entry = this.store.get().ledger[slot];
    if (entry?.commandId !== row.id) {
      log.debug('command.finish_skipped', {
        commandId: row.id,
        deviceId: device.id,
        capability: row.capability,
        status: row.status,
        reason: entry === undefined ? 'no_entry' : 'superseded',
      });
      return;
    }
    const latencyMs = elapsedSince(entry.requestedAt);
    if (row.status === 'succeeded') {
      log.info('command.succeeded', {
        commandId: row.id,
        deviceId: device.id,
        capability: row.capability,
        latencyMs,
      });
      this.store.update((state) => withEntry(settled(state, device, row), slot, null));
      return;
    }
    const failure = failureOf(row);
    this.store.update((state) =>
      withEntry(state, slot, { commandId: null, value: null, expiresAt: null, failure }),
    );
    notify({ message: `${device.label} did not change`, error: failure, tone: 'critical' });
    log.warn(row.status === 'expired' ? 'command.timed_out' : 'command.failed', {
      commandId: row.id,
      deviceId: device.id,
      capability: row.capability,
      status: row.status,
      reason: failure,
      latencyMs,
    });
  }
}
