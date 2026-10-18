import {
  ApiError,
  MACHINE_ACTION_SUPPORTS,
  MACHINE_PERMISSION_STATES,
  PHONE_FEATURE_SUPPORTS,
  type DeviceEvent,
  type DeviceRow,
  type DiscoveredDevice,
  type MachineAction,
  type PhoneActionOrigin,
  type PhoneContext,
  type PhoneDetail,
  type PhoneReport,
  splitPhoneDetail,
  stampPhoneDetail,
  type RowChange,
  type StateUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { DeviceRecord } from '../database/port';
import type { Core, HubParts } from '../hub-assembly';
import type { Store } from '../store/store';
import { nextContext } from './phone-context';
import {
  describePhone,
  isPhoneCapability,
  phoneExternalId,
  type PhoneIdentity,
  type PhoneMachine,
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

function reportedOrStored<T>(
  reported: readonly T[] | undefined,
  schema: z.ZodType<T[]>,
  stored: unknown,
): readonly T[] {
  if (reported !== undefined) return reported;
  const kept = schema.safeParse(stored);
  return kept.success ? kept.data : [];
}

function machineOf(report: PhoneReport, known: DeviceRow | undefined): PhoneMachine {
  return {
    actions: reportedOrStored(
      report.actions,
      MACHINE_ACTION_SUPPORTS,
      known?.details['machineActions'],
    ),
    permissions: reportedOrStored(
      report.permissions,
      MACHINE_PERMISSION_STATES,
      known?.details['machinePermissions'],
    ),
    features: reportedOrStored(
      report.features,
      PHONE_FEATURE_SUPPORTS,
      known?.details['phoneFeatures'],
    ),
  };
}

function isCurrent(device: DeviceRow, wanted: DiscoveredDevice): boolean {
  const shapes = (
    capabilities: readonly { readonly key: string; readonly access: string }[],
  ): string =>
    capabilities
      .map((capability) => `${capability.key}:${capability.access}`)
      .sort()
      .join(',');
  return (
    shapes(device.capabilities) === shapes(wanted.capabilities) &&
    ['machineActions', 'machinePermissions', 'phoneFeatures'].every(
      (name) => JSON.stringify(device.details[name]) === JSON.stringify(wanted.details[name]),
    )
  );
}

export interface PhoneReported {
  readonly target: PhoneTarget;
  readonly at: string;
  readonly detail: PhoneDetail | undefined;
}

export type PhoneReportListener = (reported: PhoneReported) => void;

export class PhoneNodes {
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<PhoneReportListener>();

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

  onReport(listener: PhoneReportListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  async report(phone: PhoneIdentity, report: PhoneReport): Promise<void> {
    const device = await this.ensure(phone, report);
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
    const detail = this.storeDetail(device, report);
    this.options.log.info('phone.reported', {
      device: device.id,
      values: Object.keys(report.values).length,
      events: report.events.map((event) => event.kind).join(', '),
      detail: detail === undefined ? '' : Object.keys(detail).join(', '),
    });
    const reported: PhoneReported = { target: this.target(device), at: report.at, detail };
    this.listeners.forEach((listener) => {
      listener(reported);
    });
  }

  private storeDetail(device: DeviceRow, report: PhoneReport): PhoneDetail | undefined {
    if (report.detail === undefined) return undefined;
    const { update, invalid } = splitPhoneDetail(report.detail);
    invalid.forEach(({ section, issue }) => {
      this.options.log.warn('phone.detail_invalid', { device: device.id, section, issue });
    });
    if (update === undefined) return undefined;
    const parts = stampPhoneDetail(update, report.at);
    this.options.store.phoneDetails.merge(device.id, parts);
    return parts;
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

  recordAction(
    device: DeviceRow,
    action: MachineAction,
    origin: PhoneActionOrigin,
    at: Date,
  ): void {
    this.options.event({
      externalId: device.external_id,
      kind: 'machine_action',
      occurredAt: at.toISOString(),
      details: { action, source: origin.source, client: origin.client },
    });
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

  private async ensure(phone: PhoneIdentity, report: PhoneReport): Promise<DeviceRow> {
    const externalId = phoneExternalId(phone.clientId);
    const known = this.deviceOf(externalId);
    const wanted = describePhone(phone, machineOf(report, known));
    if (
      known?.name === phone.name &&
      detailText(known, 'profileId') === phone.profileId &&
      isCurrent(known, wanted)
    ) {
      return known;
    }
    await this.options.apply([wanted]);
    const saved = this.deviceOf(externalId);
    if (saved === undefined) {
      throw new ApiError('internal', 'This phone could not be saved as a device.');
    }
    this.options.log.info('phone.device_saved', { device: saved.id, client: phone.clientId });
    return saved;
  }

  private deviceOf(externalId: string): DeviceRow | undefined {
    return this.options.store.devices.byExternal('local', externalId);
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
