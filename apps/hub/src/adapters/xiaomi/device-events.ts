import {
  deviceEventFromLegacyButton,
  deviceEventFromMiot,
  isCameraModel,
  miotDetection,
  miotEventDetails,
  miotEventOf,
  supportsLegacyButton,
  unspecifiedMiotEvent,
  type LegacyChildEvent,
  type Uplink,
} from '@smarteverything/xiaomi';
import type { CameraDetection, DeviceEvent, AdapterSink, JsonValue } from '@smarteverything/domain';
import type { InventoryEntry } from './inventory';

export const CALL_STATUS = 'key-call-status';
const CALL_START = 'key-call-start';

export interface DeviceEventsContext {
  readonly sink: () => AdapterSink | null;
  readonly now: () => number;
  readonly cameraDetected: (event: DeviceEvent, detection: CameraDetection) => void;
}

export class DeviceEvents {
  constructor(
    private readonly entry: InventoryEntry,
    private readonly context: DeviceEventsContext,
  ) {}

  private get did(): string {
    return this.entry.cloud.did;
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

  uplinkEvent(uplink: Extract<Uplink, { readonly kind: 'event' }>): void {
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

  emit(
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
