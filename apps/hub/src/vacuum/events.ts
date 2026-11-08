import {
  VacuumValueError,
  vacuumJob,
  vacuumMode,
  vacuumScope,
  type DeviceEvent,
  type JsonValue,
  type VacuumActiveFault,
  type VacuumValues,
} from '@smarteverything/domain';
import {
  VACUUM_EVENT_FAMILY,
  closeAlert,
  vacuumFault,
  vacuumFaultEvent,
  type ConsumableId,
  type VacuumCommand,
} from '@smarteverything/xiaomi';
import { z } from 'zod';

export const CONSUMABLE_LOW_PERCENT = 10;

const FAULT_LIST = z.looseObject({
  ts: z.number().int().nonnegative().optional(),
  fault: z.array(z.number().int().nonnegative()),
});

const FAULT_CODE = z.number().int().nonnegative();

function faultOccurrence(deviceId: string, code: number, stamp: number): string {
  return `vacuum:${deviceId}:fault:${String(code)}:${String(stamp)}`;
}

function parseFaultList(text: JsonValue): z.infer<typeof FAULT_LIST> {
  const expected = 'a JSON object with a fault list';
  if (typeof text !== 'string') {
    throw new VacuumValueError('vacuum_fault_ids', expected, text);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (cause) {
    throw new VacuumValueError('vacuum_fault_ids', expected, text, { cause });
  }
  const parsed = FAULT_LIST.safeParse(decoded);
  if (!parsed.success) {
    throw new VacuumValueError('vacuum_fault_ids', expected, text);
  }
  return parsed.data;
}

const UNKNOWN_FAULT_HINT = 'No description from Xiaomi';

function faultFor(code: number, since: string): VacuumActiveFault | null {
  const entry = vacuumFault(code);
  if (entry === null) {
    return {
      code,
      title: `Fault ${String(code)}`,
      hint: UNKNOWN_FAULT_HINT,
      canHelp: false,
      since,
    };
  }
  if (entry.type === 'alert') return null;
  return {
    code,
    title: entry.title,
    hint: entry.detail?.[0] ?? entry.message,
    canHelp: entry.handledButton === true,
    since,
  };
}

export class VacuumFaultWatch {
  private readonly active = new Map<string, ReadonlySet<number>>();
  private readonly since = new Map<string, ReadonlyMap<number, string>>();
  private readonly latched = new Map<string, number>();

  list(deviceId: string, value: JsonValue, occurredAt: string): readonly DeviceEvent[] {
    const { fault, ts } = parseFaultList(value);
    const codes = fault.filter((code) => code !== 0);
    const known = this.active.get(deviceId) ?? new Set<number>();
    this.active.set(deviceId, new Set(codes));
    const before = this.since.get(deviceId);
    this.since.set(
      deviceId,
      new Map(codes.map((code) => [code, before?.get(code) ?? occurredAt] as const)),
    );
    return codes
      .filter((code) => !known.has(code))
      .map((code) => {
        const event = vacuumFaultEvent(code, {
          externalId: deviceId,
          occurredAt,
          details: { source: 'fault-ids' },
        });
        return ts === undefined
          ? event
          : { ...event, occurrence: faultOccurrence(deviceId, code, ts) };
      });
  }

  error(deviceId: string): VacuumActiveFault | null {
    const faults = [...(this.since.get(deviceId) ?? [])]
      .map(([code, since]) => faultFor(code, since))
      .filter((fault) => fault !== null);
    return faults.reduce<VacuumActiveFault | null>(
      (latest, fault) =>
        latest === null || (fault.since ?? '') >= (latest.since ?? '') ? fault : latest,
      null,
    );
  }

  latch(deviceId: string, value: JsonValue, occurredAt: string): readonly DeviceEvent[] {
    const parsed = FAULT_CODE.safeParse(value);
    if (!parsed.success) {
      throw new VacuumValueError('fault', 'a fault code', value);
    }
    const code = parsed.data;
    const previous = this.latched.get(deviceId);
    this.latched.set(deviceId, code);
    const known = this.active.get(deviceId) ?? new Set<number>();
    if (previous === undefined || previous === code || code === 0 || known.has(code)) {
      return [];
    }
    this.active.set(deviceId, new Set([...known, code]));
    this.since.set(deviceId, new Map([...(this.since.get(deviceId) ?? []), [code, occurredAt]]));
    return [
      vacuumFaultEvent(code, { externalId: deviceId, occurredAt, details: { source: 'fault' } }),
    ];
  }
}

export interface ConsumableReading {
  readonly deviceId: string;
  readonly id: ConsumableId;
  readonly level: number;
  readonly occurredAt: string;
}

export class VacuumConsumableWatch {
  private readonly levels = new Map<string, number>();

  observe(reading: ConsumableReading): DeviceEvent | null {
    const key = `${reading.deviceId}|${reading.id}`;
    const previous = this.levels.get(key);
    this.levels.set(key, reading.level);
    if (reading.level >= CONSUMABLE_LOW_PERCENT) {
      return null;
    }
    if (previous === undefined || previous < CONSUMABLE_LOW_PERCENT) {
      return null;
    }
    return {
      externalId: reading.deviceId,
      kind: 'maintenance',
      occurredAt: reading.occurredAt,
      details: {
        family: VACUUM_EVENT_FAMILY,
        source: 'state',
        item: reading.id,
        state: 'low',
        level: reading.level,
        threshold: CONSUMABLE_LOW_PERCENT,
      },
    };
  }
}

export interface CleanRoom {
  readonly id: number;
  readonly name: string;
}

export interface CleanFacts {
  readonly id: string | null;
  readonly areaM2: number | null;
  readonly areaRaw: number | null;
  readonly seconds: number | null;
  readonly scope: string | null;
  readonly mode: string | null;
  readonly rooms: readonly CleanRoom[];
}

export interface CleanExtras {
  readonly id: string | null;
  readonly areaM2: number | null;
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

export function cleanFactsOf(
  values: VacuumValues,
  roomNames: ReadonlyMap<number, string>,
  extras: CleanExtras,
): CleanFacts {
  const job = vacuumJob(values);
  return {
    id: extras.id,
    areaM2: extras.areaM2,
    areaRaw: numberOf(values.vacuum_area),
    seconds: numberOf(values.vacuum_seconds),
    scope: vacuumScope(values),
    mode: vacuumMode(values),
    rooms: (job?.rooms ?? []).map((id) => ({
      id,
      name: roomNames.get(id) ?? `Room ${String(id)}`,
    })),
  };
}

export function cleanOccurrence(deviceId: string, cleanId: string): string {
  return `vacuum:${deviceId}:${cleanId}:end`;
}

export function cleanStartOccurrence(deviceId: string, cleanId: string): string {
  return `vacuum:${deviceId}:${cleanId}:start`;
}

export function cycleFinishedWithFacts(event: DeviceEvent, facts: CleanFacts): DeviceEvent {
  const details: Record<string, JsonValue> = {
    ...event.details,
    cleanId: facts.id,
    areaM2: facts.areaM2,
    areaRaw: facts.areaRaw,
    seconds: facts.seconds,
    scope: facts.scope,
    mode: facts.mode,
    rooms: facts.rooms.map((room) => ({ id: room.id, name: room.name })),
  };
  return {
    ...event,
    details,
    ...(facts.id === null ? {} : { occurrence: cleanOccurrence(event.externalId, facts.id) }),
  };
}

export function alertDismissal(event: DeviceEvent): VacuumCommand | null {
  const { family, name, code } = event.details;
  return event.kind === 'activity' &&
    family === VACUUM_EVENT_FAMILY &&
    name === 'alert' &&
    typeof code === 'number'
    ? closeAlert(code)
    : null;
}
