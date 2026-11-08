import {
  VacuumValueError,
  vacuumFaultText,
  type CapabilityKey,
  type DeviceEvent,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { vacuumConsumables, type ConsumableId } from '@smarteverything/xiaomi';
import { vacuumPropertyKey } from './capabilities';
import { VacuumConsumableWatch, VacuumFaultWatch } from './events';

export interface FeedChange {
  readonly externalId: string;
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
  readonly occurredAt: string;
}

const FAULT_LIST_KEY = vacuumPropertyKey('fault-ids');
const FAULT_KEY = vacuumPropertyKey('fault');

const CONSUMABLE_KEYS: ReadonlyMap<CapabilityKey, ConsumableId> = new Map(
  vacuumConsumables().map(
    ({ id, level }) => [`raw:${String(level.siid)}.${String(level.piid)}`, id] as const,
  ),
);

export function isVacuumFeedKey(capability: CapabilityKey): boolean {
  return (
    capability === FAULT_LIST_KEY || capability === FAULT_KEY || CONSUMABLE_KEYS.has(capability)
  );
}

export class VacuumEventFeed {
  private readonly faults = new VacuumFaultWatch();
  private readonly consumables = new VacuumConsumableWatch();

  constructor(private readonly log: Logger) {}

  baseline(externalId: string, stored: JsonValue | undefined, at: string): void {
    if (stored === undefined) return;
    this.observe({ externalId, capability: FAULT_LIST_KEY, value: stored, occurredAt: at });
  }

  faultText(externalId: string): string {
    return vacuumFaultText(this.faults.error(externalId));
  }

  observe(change: FeedChange): readonly DeviceEvent[] {
    try {
      return this.eventsOf(change);
    } catch (error) {
      if (!(error instanceof VacuumValueError)) throw error;
      this.log.warn('vacuum_events.value_unreadable', {
        externalId: change.externalId,
        capability: change.capability,
        reason: error.message,
      });
      return [];
    }
  }

  private eventsOf(change: FeedChange): readonly DeviceEvent[] {
    const { externalId, capability, value, occurredAt } = change;
    if (capability === FAULT_LIST_KEY) return this.faults.list(externalId, value, occurredAt);
    if (capability === FAULT_KEY) return this.faults.latch(externalId, value, occurredAt);
    const id = CONSUMABLE_KEYS.get(capability);
    if (id === undefined || typeof value !== 'number') return [];
    const event = this.consumables.observe({ deviceId: externalId, id, level: value, occurredAt });
    return event === null ? [] : [event];
  }
}
