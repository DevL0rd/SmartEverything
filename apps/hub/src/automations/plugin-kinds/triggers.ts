import {
  PLUGIN_TRIGGER,
  pluginTriggerKindId,
  type FlowType,
  type MatcherMapping,
  type MatcherVariant,
  type PluginEventKind,
  type PluginKindProblems,
  type PluginTrigger,
} from '@smarteverything/domain';
import { PLUGIN_ORIGIN_ICON, type AutomationContribution } from './contributions';

export interface PluginTriggers {
  readonly triggers: readonly PluginTrigger[];
  readonly rejections: readonly PluginKindProblems[];
}

const FIELD_TYPES: Readonly<Record<PluginEventKind['fields'][string], FlowType>> = {
  string: { t: 'text' },
  number: { t: 'number' },
  boolean: { t: 'boolean' },
};

function nameOf(key: string): string {
  return key.replaceAll(/[^A-Za-z0-9_]/g, '_');
}

function autoDraft(contribution: AutomationContribution, event: PluginEventKind): unknown {
  const fields = Object.entries(event.fields).map(([key, kind]) => ({
    key,
    name: nameOf(key),
    type: FIELD_TYPES[kind],
  }));
  return {
    id: nameOf(event.kind),
    version: 1,
    title: event.title,
    description: `${contribution.name}: ${event.title}`,
    icon: PLUGIN_ORIGIN_ICON,
    keywords: [event.kind],
    summary: event.title,
    event: event.kind,
    filters: fields.map((field) => ({
      name: field.name,
      title: field.key,
      type: field.type,
      match: field.key,
      description: `Only when ${field.key} is this value`,
    })),
    outputs: fields.map((field) => ({
      name: field.name,
      title: field.key,
      type: field.type,
      from: field.key,
    })),
  };
}

function autoEvents(contribution: AutomationContribution): readonly PluginEventKind[] {
  const { automation, events } = contribution;
  if (!automation.autoTriggers) return [];
  const covered = new Set(
    automation.triggers.flatMap((trigger) =>
      typeof trigger.event === 'string' ? trigger.event : [],
    ),
  );
  return events.filter((event) => !covered.has(event.kind));
}

export function triggersOf(contribution: AutomationContribution): PluginTriggers {
  const taken = new Set(contribution.automation.triggers.map((trigger) => trigger.id));
  const triggers: PluginTrigger[] = [...contribution.automation.triggers];
  const rejections: PluginKindProblems[] = [];
  for (const event of autoEvents(contribution)) {
    const draft = autoDraft(contribution, event);
    const parsed = PLUGIN_TRIGGER.safeParse(draft);
    const id = nameOf(event.kind);
    const kindId = pluginTriggerKindId(contribution.owner, id);
    if (!parsed.success) {
      rejections.push({ kindId, problems: parsed.error.issues.map((issue) => issue.message) });
    } else if (taken.has(parsed.data.id)) {
      rejections.push({
        kindId,
        problems: [`the trigger id ${id} is already used by another trigger of this plugin`],
      });
    } else {
      taken.add(parsed.data.id);
      triggers.push(parsed.data);
    }
  }
  return { triggers, rejections };
}

function variantOf(
  contribution: AutomationContribution,
  trigger: PluginTrigger,
): MatcherVariant | null {
  const event = trigger.event;
  if (typeof event !== 'string') {
    const match = event.match ?? {};
    return Object.keys(match).length === 0
      ? { source: 'event', kind: event.deviceEvent }
      : { source: 'event', kind: event.deviceEvent, match };
  }
  return contribution.signalSource === null
    ? null
    : { source: contribution.signalSource, kind: event };
}

export function triggerMapping(
  contribution: AutomationContribution,
  trigger: PluginTrigger,
): MatcherMapping | null {
  const variant = variantOf(contribution, trigger);
  if (variant === null) return null;
  const subject = trigger.filters.find((filter) => filter.match === 'subject');
  return {
    variantPort: null,
    defaultVariant: '',
    variants: { '': variant },
    subjectPort: subject?.name ?? null,
    fieldPort: null,
    matchPorts: Object.fromEntries(
      trigger.filters.filter((filter) => filter.match !== 'subject').map((f) => [f.name, f.match]),
    ),
    runtimePorts: [],
    outputs: Object.fromEntries(trigger.outputs.map((output) => [output.name, output.from])),
  };
}
