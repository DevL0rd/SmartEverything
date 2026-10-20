import {
  CommandRefusedError,
  validateCommand,
  type AdapterSink,
  type CameraDetection,
  type CapabilityKey,
  type DeviceCapability,
  type DeviceCommand,
  type DeviceEvent,
  type DiscoveredDevice,
  type JsonValue,
  type StateUpdate,
} from '@smarteverything/domain';
import {
  callEventName,
  deviceEventFromMiot,
  deviceEventFromLegacyButton,
  fromDevice,
  isCameraModel,
  miotDetection,
  miotEventDetails,
  miotEventOf,
  propertyKeyOf,
  toDevice,
  supportsLegacyButton,
  unspecifiedMiotEvent,
  XiaomiCloudError,
  type PropertyBinding,
  type PropertyReading,
  type Uplink,
  type LegacyChildEvent,
} from '@smarteverything/xiaomi';
import { RepeatLog } from '../../providers/repeat-log';
import type { PassiveSource } from '../../local/passive-observations';
import { actionInputs } from './action-inputs';
import type { CameraMotor } from './camera-motor';
import { CameraPtz } from './camera-ptz';
import type { DeviceIo } from './device-io';
import { DeviceLink, type LinkContext, type Opened, type RefreshTrigger } from './device-link';
import type { InventoryEntry, TransportState } from './inventory';
import { MiioTimeoutError } from './miio-client';
import { background, failureLine } from '@smarteverything/logging';

export interface RunnerContext extends LinkContext {
  readonly sink: () => AdapterSink | null;
  readonly childEvent?: (gateway: DeviceRunner, uplink: LegacyChildEvent) => (() => void) | null;
  readonly motor: CameraMotor | null;
  readonly devicesChanged: () => void;
  readonly cameraDetected: (event: DeviceEvent, detection: CameraDetection) => void;
}

const CALL_STATUS = 'key-call-status';
const CALL_START = 'key-call-start';

export class DeviceRunner {
  private readonly values = new Map<CapabilityKey, JsonValue>();
  private readonly raw = new Map<CapabilityKey, JsonValue>();
  private readonly generations = new Map<CapabilityKey, number>();
  private passiveKeys: ReadonlySet<CapabilityKey> = new Set();
  private passiveFreshUntil = 0;
  private lanFailures = 0;
  private readonly ptz: CameraPtz | null;
  private readonly link: DeviceLink;
  private readonly repeat: RepeatLog;

  constructor(
    readonly entry: InventoryEntry,
    opened: Opened,
    private readonly context: RunnerContext,
  ) {
    this.repeat = new RepeatLog(context.log);
    this.ptz =
      entry.ptz === null
        ? null
        : new CameraPtz(
            { did: entry.cloud.did, model: entry.cloud.model, plan: entry.ptz },
            context.motor,
            context.log,
          );
    const setup = {
      did: entry.cloud.did,
      opened,
      readable: this.readable.length > 0,
      online: entry.cloud.online,
    };
    this.link = new DeviceLink(setup, context, {
      refresh: (trigger): Promise<void> => this.refresh(trigger),
      uplink: (uplink): void => {
        this.uplink(uplink);
      },
      childUplink: (uplink): (() => void) | null => context.childEvent?.(this, uplink) ?? null,
      changed: context.devicesChanged,
    });
  }

  get did(): string {
    return this.entry.cloud.did;
  }

  private get io(): DeviceIo {
    return this.link.current;
  }

  get readable(): readonly (PropertyBinding & { readonly key: CapabilityKey })[] {
    return [...this.entry.model.bindings].flatMap(([key, binding]) =>
      binding.kind === 'property' && binding.readable ? [{ ...binding, key }] : [],
    );
  }

  observePassive(source: PassiveSource | null): void {
    this.passiveKeys = new Set(source?.keys);
    this.passiveFreshUntil = source?.freshUntil ?? 0;
    for (const key of this.passiveKeys) this.advance(key);
    for (const [key, value] of source?.values ?? []) this.values.set(key, value);
  }

  transportState(): TransportState {
    return this.link.state();
  }

  start(): void {
    this.link.start();
  }

  lanMayBeBack(): void {
    this.link.lanMayBeBack();
  }

  ptzCapabilities(): DeviceCapability[] {
    return this.ptz === null ? [] : this.ptz.capabilities();
  }

  async loadPtzPositions(): Promise<void> {
    await this.ptz?.load(this.io);
  }

  async readAll(): Promise<{ readonly all: StateUpdate[]; readonly changed: StateUpdate[] }> {
    return this.read(this.readable);
  }

  private async refresh(trigger: RefreshTrigger): Promise<void> {
    try {
      await this.publishAll();
      this.lanFailures = 0;
    } catch (error) {
      await this.refreshFailed(error, trigger);
    }
  }

  private async publishAll(): Promise<void> {
    const { all, changed } = await this.readAll();
    this.publish(changed);
    this.answered(all.length > 0);
  }

  private answered(usable: boolean): void {
    if (this.io.transport === 'lan') {
      this.link.reach.heard();
      return;
    }
    background(this.link.reach.disputed(usable), 'reach.disputed_failed');
  }

  private publish(updates: readonly StateUpdate[]): void {
    for (const update of updates) {
      this.context.sink()?.state(update);
    }
  }

  async execute(command: DeviceCommand, device: DiscoveredDevice): Promise<JsonValue> {
    const value = validateCommand(device, command);
    if (this.ptz?.handles(command.capability) === true) {
      return this.ptz.execute(command.capability, value, this.io);
    }
    const binding = this.entry.model.bindings.get(command.capability);
    if (binding === undefined) {
      throw new CommandRefusedError(
        command.capability,
        'it is not a MIoT property or action of this device',
      );
    }
    if (binding.kind === 'action') {
      return this.io.action(
        { siid: binding.siid, aiid: binding.aiid },
        actionInputs(command.capability, binding, value),
      );
    }
    const key = command.capability;
    const write = {
      siid: binding.siid,
      piid: binding.piid,
      value: toDevice(key, binding.codec, value),
    };
    this.advance(key);
    try {
      await this.io.write([write]);
    } finally {
      this.advance(key);
    }
    if (binding.readable) {
      const { changed } = await this.read([{ ...binding, key }]);
      this.publish(changed);
    }
    return value;
  }

  private advance(key: CapabilityKey): number {
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    return generation;
  }

  async close(): Promise<void> {
    await this.link.stop();
  }

  private async read(
    bindings: readonly (PropertyBinding & { readonly key: CapabilityKey })[],
  ): Promise<{ readonly all: StateUpdate[]; readonly changed: StateUpdate[] }> {
    if (bindings.length === 0) {
      return { all: [], changed: [] };
    }
    const generations = new Map(bindings.map(({ key }) => [key, this.advance(key)]));
    const readings = await this.io.read(bindings.map(({ siid, piid }) => ({ siid, piid })));
    return this.accepted(readings, generations);
  }

  private accepted(
    readings: readonly PropertyReading[],
    generations?: ReadonlyMap<CapabilityKey, number>,
  ): {
    readonly all: StateUpdate[];
    readonly changed: StateUpdate[];
  } {
    const observedAt = new Date(this.context.now()).toISOString();
    const all: StateUpdate[] = [];
    const changed: StateUpdate[] = [];
    const current = readings.filter((reading) => this.currentReading(reading, generations));
    if (current.some((reading) => this.ptz?.observe(reading) === true)) {
      this.context.devicesChanged();
    }
    for (const reading of current) {
      const update = this.accept(reading, observedAt, generations === undefined);
      if (update !== null) {
        all.push(update.state);
        if (update.changed) {
          changed.push(update.state);
        }
      }
    }
    return { all, changed };
  }

  private currentReading(
    reading: PropertyReading,
    generations: ReadonlyMap<CapabilityKey, number> | undefined,
  ): boolean {
    const key = propertyKeyOf(this.entry.model, reading.siid, reading.piid);
    if (
      generations !== undefined &&
      key !== null &&
      this.passiveKeys.has(key) &&
      this.io.transport === 'cloud' &&
      this.context.now() < this.passiveFreshUntil
    ) {
      return false;
    }
    return (
      generations === undefined ||
      key === null ||
      generations.get(key) === (this.generations.get(key) ?? 0)
    );
  }

  private accept(
    reading: PropertyReading,
    observedAt: string,
    pushed: boolean,
  ): { readonly state: StateUpdate; readonly changed: boolean } | null {
    const key = propertyKeyOf(this.entry.model, reading.siid, reading.piid);
    const binding = key === null ? undefined : this.entry.model.bindings.get(key);
    if (key === null || binding?.kind !== 'property' || !reading.ok) {
      this.context.log.debug('xiaomi_device.property_unread', {
        did: this.did,
        siid: reading.siid,
        piid: reading.piid,
      });
      return null;
    }
    try {
      const value = fromDevice(key, binding.codec, reading.value);
      if (pushed) this.advance(key);
      this.observeCall(binding, key, reading.value, observedAt);
      const changed = JSON.stringify(this.values.get(key)) !== JSON.stringify(value);
      this.values.set(key, value);
      return { state: { externalId: this.did, capability: key, value, observedAt }, changed };
    } catch (error) {
      this.context.log.warn('xiaomi_device.value_refused', {
        did: this.did,
        capability: key,
        reason: failureLine(error),
      });
      return null;
    }
  }

  private observeCall(
    binding: PropertyBinding,
    key: CapabilityKey,
    raw: JsonValue,
    observedAt: string,
  ): void {
    const previous = this.raw.get(key);
    this.raw.set(key, raw);
    const name = binding.name === CALL_STATUS ? callEventName(previous, raw) : null;
    if (name !== null) {
      this.emit(name, observedAt, { source: 'key-call-status' });
    }
  }

  private async refreshFailed(error: unknown, trigger: RefreshTrigger): Promise<void> {
    const operation = trigger === 'poll' ? 'poll' : 'subscription-refresh';
    const event =
      trigger === 'poll'
        ? 'xiaomi_device.poll_failed'
        : 'xiaomi_device.subscription_refresh_failed';
    this.repeat.warn(event, `${this.did}|${event}`, {
      did: this.did,
      transport: this.io.transport,
      reason: failureLine(error),
    });
    this.context.sink()?.failure({
      provider: 'xiaomi',
      externalId: this.did,
      operation: `${this.io.transport}-${operation}`,
      cause: error,
    });
    if (this.io.transport === 'cloud' && error instanceof XiaomiCloudError) {
      background(this.link.reach.disputed(false), 'reach.disputed_failed');
    }
    if (this.io.transport !== 'lan' || !(error instanceof MiioTimeoutError)) {
      return;
    }
    this.lanFailures += 1;
    if (this.lanFailures >= this.context.timing.lanFailuresBeforeCloud) {
      await this.link.useCloud(
        `the LAN stopped answering after ${String(this.lanFailures)} polls: ${error.message}`,
      );
    }
  }

  legacyChildDelivery(gatewayDid: string, uplink: LegacyChildEvent): (() => void) | null {
    if (this.entry.cloud.model !== uplink.model || !supportsLegacyButton(uplink.model)) {
      return null;
    }
    return (): void => {
      const event = deviceEventFromLegacyButton(uplink.method, {
        externalId: this.did,
        occurredAt: new Date(this.context.now()).toISOString(),
        details: { source: 'lan-push', gatewayExternalId: gatewayDid, messageId: uplink.id },
      });
      this.context.sink()?.event(event);
    };
  }

  private uplink(uplink: Uplink): void {
    if (uplink.kind === 'child-event') {
      return;
    }
    this.link.reach.heard();
    if (uplink.kind === 'properties') {
      this.publish(this.accepted(uplink.readings).changed);
      return;
    }
    const shape =
      (this.entry.spec === null ? null : miotEventOf(this.entry.spec, uplink.siid, uplink.eiid)) ??
      unspecifiedMiotEvent(uplink.siid, uplink.eiid);
    if (shape.name === CALL_START && this.watchesCallStatus()) {
      return;
    }
    const occurredAt = new Date(this.context.now()).toISOString();
    this.emit(
      shape.name,
      occurredAt,
      { source: 'lan-push' },
      miotEventDetails(shape, uplink.arguments),
    );
  }

  private emit(
    name: string,
    occurredAt: string,
    details: Record<string, JsonValue>,
    miotArguments: Record<string, JsonValue> = {},
  ): void {
    const event = deviceEventFromMiot(
      name,
      { externalId: this.did, occurredAt, details },
      miotArguments,
    );
    const detection = isCameraModel(this.entry.cloud.model) ? miotDetection(name) : null;
    if (detection === null) {
      this.context.sink()?.event(event);
      return;
    }
    this.context.cameraDetected(event, detection);
  }

  private watchesCallStatus(): boolean {
    return [...this.entry.model.bindings.values()].some(
      (binding) => binding.kind === 'property' && binding.name === CALL_STATUS,
    );
  }
}
