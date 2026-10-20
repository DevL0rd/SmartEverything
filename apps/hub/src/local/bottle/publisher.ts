import {
  packedRgbToHsv,
  type AdapterSink,
  type BottleCap,
  type BottleLink,
  type BottleQuiet,
  type BottleReminder,
  type CapabilityKey,
  type JsonValue,
} from '@smarteverything/domain';
import type { Level } from './summary';

interface PublishInput {
  readonly externalId: string;
  readonly at: string;
  readonly level: Level;
  readonly cap: BottleCap;
  readonly link: BottleLink;
  readonly lastSeenAt: string | null;
  readonly lastDrinkAt: string | null;
  readonly lastUvAt: string | null;
  readonly firmware: string | null;
  readonly rssi: number | null;
  readonly reminder: BottleReminder | null;
  readonly quiet: BottleQuiet | null;
}

const HEX_BASE = 16;

const WRITABLE_REMINDER_STATES: ReadonlySet<string> = new Set(['off', 'interval_fixed']);

const QUIET_STATES: ReadonlySet<string> = new Set(['off', 'on', 'auto']);

function reminderStates(reminder: BottleReminder | null): [CapabilityKey, JsonValue][] {
  if (reminder === null) {
    return [];
  }
  const states: [CapabilityKey, JsonValue][] = [
    ['reminder_interval', reminder.intervalMin],
    ['reminder_from', reminder.from],
    ['reminder_to', reminder.to],
    ['reminder_colour', packedRgbToHsv(Number.parseInt(reminder.colour.slice(1), HEX_BASE))],
  ];
  if (WRITABLE_REMINDER_STATES.has(reminder.state)) {
    states.push(['hydration_reminder', reminder.state]);
  }
  return states;
}

function quietStates(quiet: BottleQuiet | null): [CapabilityKey, JsonValue][] {
  if (quiet === null) {
    return [];
  }
  const states: [CapabilityKey, JsonValue][] = [
    ['quiet_from', quiet.from],
    ['quiet_to', quiet.to],
  ];
  if (QUIET_STATES.has(quiet.state)) {
    states.push(['quiet_hours', quiet.state]);
  }
  return states;
}

function readingStates(input: PublishInput): [CapabilityKey, JsonValue | null][] {
  return [
    ['bottle_volume', input.level.ml],
    ['water_level', input.level.pct],
    ['bottle_reliable', input.level.ml === null ? null : input.level.reliable],
    ['battery', input.cap.batteryPct],
    ['bottle_state', input.cap.state],
    ['bottle_charging', input.cap.charging],
    ['bottle_link', input.link],
    ['last_seen', input.lastSeenAt],
    ['last_drink', input.lastDrinkAt],
    ['last_uv_clean', input.lastUvAt],
    ['firmware', input.firmware],
    ['signal_strength', input.rssi],
  ];
}

export function publishStates(sink: AdapterSink, input: PublishInput): void {
  const all = [
    ...readingStates(input),
    ...reminderStates(input.reminder),
    ...quietStates(input.quiet),
  ];
  for (const [capability, value] of all) {
    if (value !== null) {
      sink.state({ externalId: input.externalId, capability, value, observedAt: input.at });
    }
  }
}
