import type { SignalMatcher } from './signal-matcher';
import { presentDevice, presentValue } from './capability-presentation';
import { LAUNDRY_EVENT_FAMILY, eventLabel } from './event-labels';
import { EVENT_KINDS, type EventKind } from './events';
import { humanizeKey } from './presentation/humanize';
import type { PresentedCapability } from './presentation/types';
import { kindSpecOf, type SignalKindSpec } from './signal-sources/spec';
import type { CatalogueDevice, TriggerLookup, TriggerRow } from './trigger-catalogue';
import { appendTiming, countWords, signalTimingOf, type SignalTiming } from './trigger-timing';
import {
  booleanWords,
  type BooleanWords,
  lowerFirst,
  matchingWords,
  plainAmount,
  testWords,
  type AmountText,
} from './trigger-words';

const REMOVED_DEVICE = 'a removed device';

interface Context {
  readonly trigger: SignalMatcher;
  readonly catalogue: TriggerLookup;
  readonly spec: SignalKindSpec | undefined;
  readonly timing: SignalTiming;
  readonly device: CatalogueDevice | undefined;
  readonly eventKind: EventKind | null;
  readonly whose: string;
}

interface Core {
  readonly text: string;
  readonly stays: string | null;
}

function nameOf(
  rows: readonly { readonly id: string; readonly name: string }[],
  id: string,
  gone: string,
): string {
  return rows.find((row) => row.id === id)?.name ?? gone;
}

function subjectName(context: Pick<Context, 'trigger' | 'spec' | 'catalogue'>): string | null {
  const { trigger, spec, catalogue } = context;
  if (trigger.subject === undefined || spec === undefined) return null;
  if (spec.subject === 'device' || spec.subject === 'camera') {
    return catalogue.devices.get(trigger.subject)?.name ?? REMOVED_DEVICE;
  }
  if (spec.subject === 'profile') {
    return nameOf(catalogue.inventory.people, trigger.subject, 'someone removed');
  }
  return spec.subject === 'chat'
    ? nameOf(catalogue.inventory.chats, trigger.subject, 'a chat')
    : null;
}

function contextOf(trigger: SignalMatcher, catalogue: TriggerLookup): Context {
  const spec = kindSpecOf(catalogue.sources, trigger);
  const device = trigger.subject === undefined ? undefined : catalogue.devices.get(trigger.subject);
  const who = subjectName({ trigger, spec, catalogue });
  return {
    trigger,
    catalogue,
    spec,
    timing: signalTimingOf(trigger),
    device,
    eventKind:
      trigger.source === 'event'
        ? (EVENT_KINDS.find((kind) => kind === trigger.kind) ?? null)
        : null,
    whose: who === null ? '' : ` for ${who}`,
  };
}

function isLaundry(context: Context): boolean {
  return context.device !== undefined && presentDevice(context.device).family === 'laundry';
}

function matchingOf(context: Context): string {
  const roomNames = new Map(context.catalogue.inventory.rooms.map((room) => [room.id, room.name]));
  return matchingWords(context.trigger.match ?? {}, {
    spec: context.spec,
    kind: context.eventKind,
    roomNames,
    spoken: new Set(context.eventKind !== null && isLaundry(context) ? ['outcome'] : []),
  });
}

function fieldOf(
  context: Context,
): { readonly label: string; readonly unit: string | null } | null {
  const fields = context.spec?.fields;
  if (fields === undefined || typeof fields === 'string') return null;
  return fields.find((entry) => entry.field === context.trigger.field) ?? null;
}

function kindLabel(context: Context): string {
  const { eventKind, trigger, spec } = context;
  if (eventKind === null) return spec?.label ?? trigger.kind;
  const details = trigger.match ?? {};
  return eventLabel(
    eventKind,
    isLaundry(context) ? { ...details, family: LAUNDRY_EVENT_FAMILY } : details,
  );
}

function sourceLabelOf(context: Context): string {
  return (
    context.catalogue.sources.find((entry) => entry.source === context.trigger.source)?.label ??
    context.trigger.source
  );
}

function pulseCore(context: Context): Core {
  const counted = countWords(context.timing);
  const field = fieldOf(context);
  const matching = matchingOf(context);
  const label = kindLabel(context);
  if (context.eventKind !== null && counted === null && field === null && matching === '') {
    const who = subjectName(context) ?? 'Any device';
    return { text: `${who} reports “${label}”`, stays: null };
  }
  const head = `${label}${counted === null ? '' : ` ${counted}`}`;
  const note = field === null ? '' : ` (${field.label})`;
  return { text: `${head}${note}${context.whose}${matching}`, stays: null };
}

function movement(context: Context, verb: string): string {
  const counted = countWords(context.timing);
  if (counted !== null) return `changes ${counted}`;
  return context.timing.silentSeconds > 0 ? '' : verb;
}

function joined(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' ');
}

function statesCore(context: Context, states: { readonly on: string; readonly off: string }): Core {
  const { trigger } = context;
  const field = fieldOf(context);
  const word = trigger.test?.is === 'eq' && trigger.test.to === false ? states.off : states.on;
  const thing = `${sourceLabelOf(context)}: ${field?.label ?? kindLabel(context)}${context.whose}`;
  return {
    text: `${joined([thing, movement(context, `becomes ${word}`)])}${matchingOf(context)}`,
    stays: word,
  };
}

function valueCore(context: Context): Core {
  const field = fieldOf(context);
  const verb =
    context.trigger.test === undefined
      ? ''
      : testWords(context.trigger.test, plainAmount(field?.unit ?? null));
  const thing = `${sourceLabelOf(context)}: ${field?.label ?? kindLabel(context)}${context.whose}`;
  return {
    text: `${joined([thing, movement(context, verb)])}${matchingOf(context)}`,
    stays: null,
  };
}

function presentedOf(context: Context): PresentedCapability | undefined {
  const { device, trigger } = context;
  return device === undefined
    ? undefined
    : presentDevice(device).capabilities.find((entry) => entry.key === trigger.field);
}

function deviceAmount(presented: PresentedCapability | undefined): AmountText {
  return (value) =>
    presented === undefined ? plainAmount(null)(value) : presentValue(presented, value);
}

function deviceName(context: Context): string {
  if (context.trigger.subject === undefined) return 'Any device';
  return context.device?.name ?? REMOVED_DEVICE;
}

function stateWord(presented: PresentedCapability | undefined, on: boolean): string | null {
  return presented?.states === undefined || presented.states === null
    ? null
    : lowerFirst(on ? presented.states[0] : presented.states[1]);
}

interface DeviceVerb {
  readonly verb: string;
  readonly stays: string | null;
}

function staysOf(
  context: Context,
  presented: PresentedCapability | undefined,
  words: BooleanWords | null,
): string | null {
  const test = context.trigger.test;
  if (words !== null) return words.stays;
  return test?.is === 'eq' ? stateWord(presented, test.to === true) : null;
}

function deviceVerb(context: Context, presented: PresentedCapability | undefined): DeviceVerb {
  const { trigger } = context;
  const label = lowerFirst(presented?.label ?? humanizeKey(trigger.field ?? ''));
  const words = booleanWords(trigger.field, trigger.test);
  const test = trigger.test;
  const phrase = test === undefined ? '' : `${label} ${testWords(test, deviceAmount(presented))}`;
  return { verb: words?.verb ?? phrase, stays: staysOf(context, presented, words) };
}

function deviceBody(context: Context, label: string, verb: string): string {
  const counted = countWords(context.timing);
  if (counted !== null) return `${label} changes ${counted}`;
  return context.timing.silentSeconds > 0 ? label : verb;
}

function deviceCore(context: Context): Core {
  const { trigger } = context;
  if (trigger.field === undefined) {
    return { text: `${kindLabel(context)}${context.whose}${matchingOf(context)}`, stays: null };
  }
  const presented = presentedOf(context);
  const label = lowerFirst(presented?.label ?? humanizeKey(trigger.field));
  const { verb, stays } = deviceVerb(context, presented);
  const body = deviceBody(context, label, verb);
  return { text: `${joined([deviceName(context), body])}${matchingOf(context)}`, stays };
}

function coreOf(context: Context): Core {
  const { spec } = context;
  if (spec?.fields === 'capabilities') return deviceCore(context);
  if (spec === undefined || spec.pulse) return pulseCore(context);
  return spec.states === undefined ? valueCore(context) : statesCore(context, spec.states);
}

export function describeTrigger(trigger: SignalMatcher, catalogue: TriggerLookup): string {
  const context = contextOf(trigger, catalogue);
  const core = coreOf(context);
  return appendTiming(core.text, context.timing, core.stays);
}

export function rowTrigger(row: TriggerRow): SignalMatcher {
  const field = row.field ?? row.fields[0]?.field;
  const test = row.states === null ? { is: 'changed' as const } : { is: 'eq' as const, to: true };
  return {
    source: row.source,
    kind: row.kind,
    ...(row.subject === null ? {} : { subject: row.subject }),
    ...(row.pulse || field === undefined ? {} : { field }),
    ...(row.pulse ? {} : { test }),
  };
}

export function rowSentence(row: TriggerRow, catalogue: TriggerLookup): string {
  return describeTrigger(rowTrigger(row), catalogue);
}
