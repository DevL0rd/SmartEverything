import type { FlowNode, FlowType, JsonValue, TriggerNode } from '@smarteverything/domain';
import { PROGRAM_SUBJECT } from './problems';
import type { Finding, LintInput, LintRule } from './lint-types';
import { finding, fixText } from './lint-types';
import { entriesOfKind, literalOf, numberOf, subjectOf, textOf } from './lint-scan';

export const LONG_DELAY_MS = 30_000;

const BUDGET_SWITCHES = ['startBucket', 'feedback', 'effects'] as const;
const DEVICE_SETTERS: readonly string[] = ['device.set', 'device.set_temporarily', 'device.toggle'];
const DEFAULT_CONTROL = 'power';

function stormFindings({ program }: LintInput): readonly Finding[] {
  if (program.kind !== 'automation') return [];
  const off = BUDGET_SWITCHES.filter((name) => program.budgets?.[name] === 'off');
  if (off.length === 0) return [];
  return [
    finding(
      'storm_protection_off',
      PROGRAM_SUBJECT,
      `Storm protection is off (${off.join(', ')}).`,
      {
        port: 'budgets',
        received: off.join(', '),
        fix: {
          summary: 'turn on the start bucket, the feedback guard and the effect budgets',
          action: { action: 'turn_on_storm_protection' },
        },
      },
    ),
  ];
}

function eventWaitFindings({ index }: LintInput): readonly Finding[] {
  return entriesOfKind(index, 'flow.wait_event')
    .filter((entry) => entry.node.ports?.['timeout'] === undefined)
    .map((entry) =>
      finding(
        'event_wait_without_timeout',
        subjectOf(entry.node),
        'This wait can last forever if the event never comes.',
        {
          port: 'timeout',
          fix: fixText('set a timeout and handle the timed out exit'),
        },
      ),
    );
}

function deviceOf(trigger: TriggerNode): string | undefined {
  const value = trigger.ports['device'];
  return value !== undefined && 'lit' in value && typeof value.lit === 'string'
    ? value.lit
    : undefined;
}

function isJsonObject(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function targetsDevice(target: JsonValue | undefined, device: string): boolean {
  if (!isJsonObject(target)) return false;
  const many = target['devices'];
  return target['device'] === device || (Array.isArray(many) && many.includes(device));
}

function feedbackFindings({ program, index }: LintInput): readonly Finding[] {
  if (program.kind !== 'automation') return [];
  const setters = entriesOfKind(index, ...DEVICE_SETTERS);
  return program.triggers.flatMap((trigger) => {
    const device = deviceOf(trigger);
    const own = trigger.ports['ignoreOwnChanges'];
    if (trigger.kind !== 'trigger.device' || device === undefined) return [];
    if (own === undefined || !('lit' in own) || own.lit !== false) return [];
    const watched = trigger.ports['control'];
    const control = watched !== undefined && 'lit' in watched ? watched.lit : undefined;
    const sets = setters.some(
      (setter) =>
        targetsDevice(literalOf(setter.node, 'target'), device) &&
        (control === undefined || (textOf(setter.node, 'control') ?? DEFAULT_CONTROL) === control),
    );
    return sets
      ? [
          finding(
            'feedback_trigger',
            { nodeId: trigger.id, key: trigger.key },
            'This automation changes the same value that starts it, so it can start itself.',
            {
              port: 'ignoreOwnChanges',
              fix: {
                summary: 'ignore changes this automation makes itself',
                action: {
                  action: 'set_port',
                  key: trigger.key,
                  port: 'ignoreOwnChanges',
                  value: { lit: true },
                },
              },
            },
          ),
        ]
      : [];
  });
}

function holdsListOfAny(type: FlowType): boolean {
  if (type.t === 'list') return type.of.t === 'any' || holdsListOfAny(type.of);
  if (type.t === 'optional') return holdsListOfAny(type.of);
  if (type.t !== 'record') return false;
  return (
    Object.values(type.fields ?? {}).some(holdsListOfAny) ||
    (type.values !== undefined && holdsListOfAny(type.values))
  );
}

function listFindings({ program }: LintInput): readonly Finding[] {
  const sites = [
    ...program.variables.map((item) => ({ port: `variables.${item.name}`, type: item.type })),
    ...program.inputs.map((item) => ({ port: `inputs.${item.name}`, type: item.type })),
    ...program.outputs.map((item) => ({ port: `outputs.${item.name}`, type: item.type })),
  ];
  return sites
    .filter((site) => holdsListOfAny(site.type))
    .map((site) =>
      finding(
        'list_of_any',
        PROGRAM_SUBJECT,
        `${site.port} is a list of anything, so nothing checks what is inside.`,
        {
          port: site.port,
          fix: fixText('give the list a real item type'),
        },
      ),
    );
}

function delayFindings({ program, index }: LintInput): readonly Finding[] {
  if (program.kind !== 'automation' || program.policy.mode !== 'single') return [];
  return entriesOfKind(index, 'flow.wait')
    .filter((entry) => (numberOf(entry.node, 'duration') ?? 0) >= LONG_DELAY_MS)
    .map((entry) =>
      finding(
        'long_delay_single',
        subjectOf(entry.node),
        'While this waits, new presses and changes are ignored because the automation runs one at a time.',
        {
          port: 'duration',
          fix: fixText('switch the run mode to queue or restart so new starts are not lost'),
        },
      ),
    );
}

function noteFindings({ index }: LintInput): readonly Finding[] {
  return entriesOfKind(index, 'notify.feed').map((entry) =>
    finding(
      'notify_feed_upgrade',
      subjectOf(entry.node),
      'This only writes a note in the activity feed. Nobody gets a push message.',
      {
        fix: fixText('use Notify person to push a message'),
      },
    ),
  );
}

const AI_TOOL_KINDS: readonly string[] = ['ai.ask'];

const AI_PROMPT_PORTS: readonly string[] = ['prompt', 'images', 'system'];

function allowsTools(node: FlowNode): boolean {
  const tools = literalOf(node, 'tools');
  if (tools === undefined) return false;
  return !Array.isArray(tools) || tools.length > 0;
}

function aiToolFindings({ index }: LintInput): readonly Finding[] {
  return entriesOfKind(index, ...AI_TOOL_KINDS)
    .filter((entry) => allowsTools(entry.node))
    .filter((entry) =>
      AI_PROMPT_PORTS.some((port) => {
        const value = entry.node.ports?.[port];
        return value !== undefined && !('lit' in value);
      }),
    )
    .map((entry) =>
      finding(
        'ai_tools_untrusted',
        subjectOf(entry.node),
        'This AI call may use tools and its question is built from data that can come from outside, such as chat text or a web answer. Someone could word that data to make the AI act.',
        {
          port: 'tools',
          fix: fixText('remove the tools, or give the AI a fixed question'),
        },
      ),
    );
}

export const adviceRules: readonly LintRule[] = [
  aiToolFindings,
  stormFindings,
  eventWaitFindings,
  feedbackFindings,
  listFindings,
  delayFindings,
  noteFindings,
];
