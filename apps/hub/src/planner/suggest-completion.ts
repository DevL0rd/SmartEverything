import {
  presentDevice,
  searchTriggerCatalogue,
  type CatalogueDevice,
  type DeviceFamily,
  type JsonValue,
  type PlannerAttachment,
  type PlannerCompletionWindow,
  type ResponseOf,
  type TriggerCatalogue,
  type TriggerRow,
} from '@smarteverything/domain';

export type CompletionSuggestions = ResponseOf<'suggestPlannerCompletion'>;

export interface SuggestInput {
  readonly title: string;
  readonly notes: string;
  readonly attachments: readonly PlannerAttachment[];
  readonly catalogue: TriggerCatalogue;
}

type Facts = Readonly<Record<string, JsonValue>>;

interface Rule {
  readonly family: DeviceFamily;
  readonly words: RegExp;
  readonly source: string;
  readonly kind: string;
  readonly window: PlannerCompletionWindow;
  readonly facts: (text: string) => Facts;
  readonly sentence: (text: string, device: string) => string;
}

const WALKING = /\b(walk|walking)\b/;
const JOGGING = /\b(jog|jogging)\b/;
const RUNNING = /\b(run|running)\b/;

function treadmillFacts(text: string): Facts {
  if (WALKING.test(text)) return { phase: 'finished', kind: 'walk' };
  if (JOGGING.test(text)) return { phase: 'finished', kind: 'jog' };
  if (RUNNING.test(text)) return { phase: 'finished', kind: 'run' };
  return { phase: 'finished' };
}

function bottleFacts(text: string): Facts {
  if (/\brefill/.test(text)) return { activity: 'refill' };
  if (/\b(clean|uv|sterili[sz]e)/.test(text)) return { activity: 'uv_clean' };
  return { activity: 'drink' };
}

function bottleSentence(text: string, device: string): string {
  const facts = bottleFacts(text);
  if (facts['activity'] === 'refill') return `${device} is refilled`;
  if (facts['activity'] === 'uv_clean') return `${device} finishes its UV clean`;
  return `${device} records a drink`;
}

const RULES: readonly Rule[] = [
  {
    family: 'toothbrush',
    words: /\b(brush|brushing|teeth|tooth|toothbrush)\b/,
    source: 'event',
    kind: 'activity',
    window: 'occurrence',
    facts: () => ({ brushing: 'finished' }),
    sentence: (_text, device) => `${device} finishes a brushing session`,
  },
  {
    family: 'treadmill',
    words: /\b(treadmill|walk|walking|jog|jogging|run|running)\b/,
    source: 'event',
    kind: 'activity',
    window: 'day',
    facts: treadmillFacts,
    sentence: (_text, device) => `${device} finishes a session`,
  },
  {
    family: 'bottle',
    words: /\b(drink|water|hydrate|hydration|bottle|refill|sip)/,
    source: 'event',
    kind: 'activity',
    window: 'day',
    facts: bottleFacts,
    sentence: bottleSentence,
  },
];

function offered(row: TriggerRow, facts: Facts): boolean {
  return Object.entries(facts).every(([key, value]) => {
    const entry = row.match.find((candidate) => candidate.key === key);
    return (
      entry !== undefined &&
      (entry.values === null || entry.values.some((choice) => choice.value === value))
    );
  });
}

function rowOf(rule: Rule, catalogue: TriggerCatalogue): TriggerRow | undefined {
  return searchTriggerCatalogue(catalogue, { query: rule.kind }).find(
    (row) => row.source === rule.source && row.kind === rule.kind && row.subject === null,
  );
}

function devicesOf(
  family: DeviceFamily,
  catalogue: TriggerCatalogue,
  attached: ReadonlySet<string>,
): readonly CatalogueDevice[] {
  const ofFamily = catalogue.inventory.devices.filter(
    (device) => presentDevice(device).family === family,
  );
  return [
    ...ofFamily.filter((device) => attached.has(device.id)),
    ...ofFamily.filter((device) => !attached.has(device.id)),
  ];
}

function suggestionFor(
  rule: Rule,
  device: CatalogueDevice,
  text: string,
): CompletionSuggestions[number] {
  const matcher = {
    source: rule.source,
    kind: rule.kind,
    subject: device.id,
    match: { ...rule.facts(text) },
  };
  return {
    label: rule.sentence(text, device.name),
    completion: { kind: 'signal', matcher, window: rule.window },
    matcher,
  };
}

export function suggestCompletions(input: SuggestInput): CompletionSuggestions {
  const text = `${input.title} ${input.notes}`.toLowerCase();
  const attached = new Set(
    input.attachments.flatMap((attachment) =>
      attachment.kind === 'device' ? [attachment.deviceId] : [],
    ),
  );
  return RULES.flatMap((rule) => {
    const row = rowOf(rule, input.catalogue);
    if (row === undefined || !offered(row, rule.facts(text))) return [];
    const devices = devicesOf(rule.family, input.catalogue, attached);
    const wanted = rule.words.test(text) || devices.some((device) => attached.has(device.id));
    return wanted ? devices.map((device) => suggestionFor(rule, device, text)) : [];
  });
}
