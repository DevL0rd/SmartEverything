import {
  ApiError,
  type DeviceEvent,
  type DeviceRow,
  type DiscoveredDevice,
  type PhoneContext,
  type PhoneReport,
  type RowChange,
  type StateUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceRecord } from '../database/port';
import type { Core, HubParts } from '../hub-assembly';
import type { Store } from '../store/store';
import { nextContext } from './phone-context';
import {
  describePhone,
  isPhoneCapability,
  PHONE_CAPABILITIES,
  phoneExternalId,
  type PhoneIdentity,
} from './phone-device';

export interface PhoneNodesOptions {
  readonly store: Store;
  readonly apply: (devices: readonly DiscoveredDevice[]) => Promise<readonly DeviceRecord[]>;
  readonly forget: (externalIds: readonly string[]) => Promise<void>;
  readonly state: (update: StateUpdate) => void;
  readonly event: (event: DeviceEvent) => void;
  readonly log: Logger;
}

export interface PhoneTarget {
  readonly deviceId: string;
  readonly clientId: string;
  readonly profileId: string;
  readonly name: string;
}

function detailText(device: DeviceRow, key: string): string | null {
  const value = device.details[key];
  return typeof value === 'string' ? value : null;
}

function hasCurrentCapabilities(device: DeviceRow): boolean {
  const known = new Set(device.capabilities.map((capability) => capability.key));
  return PHONE_CAPABILITIES.every((capability) => known.has(capability.key));
}

export class PhoneNodes {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: PhoneNodesOptions) {}

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      this.clientRemoved(change);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async report(phone: PhoneIdentity, report: PhoneReport): Promise<void> {
    const device = await this.ensure(phone);
    const externalId = phoneExternalId(phone.clientId);
    Object.entries(report.values).forEach(([capability, value]) => {
      if (isPhoneCapability(capability) && value !== undefined) {
        this.options.state({ externalId, capability, value, observedAt: report.at });
      }
    });
    report.events.forEach((event) => {
      this.options.event({
        externalId,
        kind: event.kind,
        occurredAt: event.at,
        details: event.details,
      });
    });
    const previous = this.options.store.phoneContexts.byDevice(device.id);
    this.options.store.phoneContexts.save(
      nextContext({ device: device.id, phone, previous, report }),
    );
    this.options.log.info('phone.reported', {
      device: device.id,
      values: Object.keys(report.values).length,
      events: report.events.map((event) => event.kind).join(', '),
    });
  }

  contextOf(profileId: string, viewerProfileId: string): PhoneContext {
    const entry = this.options.store.phoneContexts.latestOf(profileId);
    const own = viewerProfileId === profileId;
    if (entry === undefined) {
      return {
        profileId,
        deviceId: null,
        state: 'unknown',
        since: null,
        confidence: null,
        place: null,
        placeShared: false,
        phoneInUse: null,
        reportedAt: null,
      };
    }
    return {
      profileId,
      deviceId: entry.deviceId,
      state: entry.state,
      since: entry.since,
      confidence: entry.confidence,
      place: own ? entry.place : null,
      placeShared: own,
      phoneInUse: entry.phoneInUse,
      reportedAt: entry.reportedAt,
    };
  }

  target(device: DeviceRow): PhoneTarget {
    const clientId = detailText(device, 'clientId');
    const profileId = detailText(device, 'profileId');
    if (device.kind !== 'phone' || clientId === null || profileId === null) {
      throw new ApiError(
        'invalid_request',
        `${device.name} is not a phone running SmartEverything.`,
      );
    }
    return { deviceId: device.id, clientId, profileId, name: device.display_name ?? device.name };
  }

  private async ensure(phone: PhoneIdentity): Promise<DeviceRow> {
    const externalId = phoneExternalId(phone.clientId);
    const known = this.deviceOf(externalId);
    if (
      known?.name === phone.name &&
      detailText(known, 'profileId') === phone.profileId &&
      hasCurrentCapabilities(known)
    ) {
      return known;
    }
    await this.options.apply([describePhone(phone)]);
    const saved = this.deviceOf(externalId);
    if (saved === undefined) {
      throw new ApiError('internal', 'This phone could not be saved as a device.');
    }
    this.options.log.info('phone.device_saved', { device: saved.id, client: phone.clientId });
    return saved;
  }

  private deviceOf(externalId: string): DeviceRow | undefined {
    return this.options.store.devices
      .list()
      .find((row) => row.provider === 'local' && row.external_id === externalId);
  }

  private clientRemoved(change: RowChange): void {
    if (change.table !== 'clients' || change.operation !== 'DELETE' || change.oldRecord === null) {
      return;
    }
    const externalId = phoneExternalId(change.oldRecord.id);
    if (this.deviceOf(externalId) === undefined) {
      return;
    }
    this.options.forget([externalId]).then(
      () => {
        this.options.log.info('phone.device_removed', { externalId });
      },
      (cause: unknown) => {
        this.options.log.error('phone.device_not_removed', cause, { externalId });
      },
    );
  }
}

export function phoneNodesOf(
  parts: Pick<HubParts, 'store' | 'logFor'>,
  core: Pick<Core, 'inventory' | 'state' | 'events'>,
): PhoneNodes {
  return new PhoneNodes({
    store: parts.store,
    apply: (devices): Promise<readonly DeviceRecord[]> => core.inventory.apply('local', devices),
    forget: (externalIds): Promise<void> => core.inventory.remove('local', externalIds),
    state: (update): void => {
      core.state.push('local', update);
    },
    event: (event): void => {
      core.events.fromProvider('local', event);
    },
    log: parts.logFor('phone'),
  });
}
