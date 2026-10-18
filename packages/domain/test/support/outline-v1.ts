import type { Action } from '../../src/automation-actions';
import type { AutomationDefinition, Trigger } from '../../src/automations';
import type { AutomationSequenceDefinition } from '../../src/automation-sequences';
import type { Conditions } from '../../src/automation-conditions';
import {
  commandTextV1,
  comparisonText,
  conditionsTextV1,
  inputTextV1,
  literalTextV1,
  targetTextV1,
} from './outline-v1-expr';
import {
  INPUT_TYPE_OF,
  setOutline,
  type SetParts,
  sortedDays,
  stable,
  watchOutline,
  type Outline,
} from './outline-text';

export type DeviceAction = Extract<
  Action,
  { type: 'command' | 'target_command' | 'temporary_effect' }
>;
type SimpleAction = Extract<Action, { type: 'scene' | 'delay' | 'notify' | 'wake_ai' | 'tool' }>;
type FlowAction = Exclude<Action, DeviceAction | SimpleAction>;

function temporaryParts(action: Extract<Action, { type: 'temporary_effect' }>): SetParts {
  const { operation } = action;
  return {
    id: action.nodeId,
    target: targetTextV1(action.target),
    control: action.capability,
    to: operation.type === 'set' ? literalTextV1(operation.value) : null,
    by: operation.type === 'add' ? operation.value : null,
    percent: false,
    duration: action.durationMs,
    whileText: action.while === undefined ? null : conditionsTextV1(action.while),
    priority: action.priority,
  };
}

export function setPartsV1(action: DeviceAction): SetParts {
  if (action.type === 'temporary_effect') return temporaryParts(action);
  const to = 'binding' in action ? commandTextV1(action.binding) : literalTextV1(action.value);
  const single = action.type === 'command';
  return {
    id: action.nodeId,
    target: single ? `device:${action.deviceId}` : targetTextV1(action.target),
    control: action.capability,
    to,
    by: null,
    percent: !single && action.scale === 'percent',
    duration: null,
    whileText: null,
    priority: 0,
  };
}

function simpleOutline(action: SimpleAction): Outline {
  const id = action.nodeId ?? null;
  switch (action.type) {
    case 'scene':
      return { step: 'scene', id, scene: action.sceneId };
    case 'delay':
      return { step: 'wait', id, ms: action.seconds * 1000 };
    case 'notify':
      return { step: 'notify', id, message: action.message };
    case 'wake_ai':
      return {
        step: 'ai',
        id,
        person: action.profileId,
        chat: action.chatId,
        instruction: action.instruction,
      };
    case 'tool':
      return {
        step: 'tool',
        id,
        person: action.profileId,
        tool: action.tool,
        args: stable(action.args),
      };
  }
}

function repeatOutline(action: Extract<Action, { type: 'repeat' }>): Outline {
  const { repeat } = action;
  return {
    step: 'repeat',
    id: action.nodeId,
    times: repeat.mode === 'count' ? repeat.count : null,
    while: repeat.mode === 'while' ? conditionsTextV1(repeat.conditions) : null,
    until: repeat.mode === 'until' ? conditionsTextV1(repeat.conditions) : null,
    gapMs: action.intervalMs,
    limitMs: action.maximumDurationMs,
    steps: action.actions.map(stepOutlineV1),
  };
}

function chooseOutline(action: Extract<Action, { type: 'choose' }>): Outline {
  return {
    step: 'if',
    id: action.nodeId,
    branches: action.branches.map((branch) => ({
      id: branch.nodeId,
      when: conditionsTextV1(branch.conditions),
      then: branch.actions.map(stepOutlineV1),
    })),
    else: action.otherwise?.map(stepOutlineV1) ?? null,
  };
}

function stopOutline(action: Extract<Action, { type: 'stop' }>): Outline {
  const { target } = action;
  const key =
    target.type === 'automation' || target.type === 'sequence' ? target.controlKey : undefined;
  const automation =
    target.type === 'current' ? null : target.type === 'run' ? target.runId : target.id;
  return { step: 'stop', id: action.nodeId, automation, key: key ?? null };
}

function flowOutline(action: FlowAction): Outline {
  switch (action.type) {
    case 'choose':
      return chooseOutline(action);
    case 'repeat':
      return repeatOutline(action);
    case 'sequence':
      return {
        step: 'run',
        id: action.nodeId,
        automation: action.sequenceId,
        inputs: Object.fromEntries(
          Object.entries(action.parameters).map(([name, input]) => [name, inputTextV1(input)]),
        ),
        wait: true,
      };
    case 'value_update': {
      const change = action.operation.operation;
      return {
        step: 'value',
        id: action.nodeId,
        value: action.valueId,
        op: change.type,
        amount: 'value' in change ? `literal:${stable(change.value)}` : null,
      };
    }
    case 'stop':
      return stopOutline(action);
  }
}

export function isDevice(action: Action): action is DeviceAction {
  return (
    action.type === 'command' ||
    action.type === 'target_command' ||
    action.type === 'temporary_effect'
  );
}

function isSimple(action: Action): action is SimpleAction {
  return ['scene', 'delay', 'notify', 'wake_ai', 'tool'].includes(action.type);
}

export function stepOutlineV1(action: Action): Outline {
  if (isDevice(action)) return setOutline(setPartsV1(action));
  return isSimple(action) ? simpleOutline(action) : flowOutline(action);
}

function speechSource(source: Extract<Trigger, { type: 'speech' }>['source']): string | null {
  if (source === null) return null;
  if ('deviceId' in source) return `${source.kind}:${source.deviceId}`;
  return source.kind === 'plugin'
    ? `plugin:${source.pluginId}:${source.sourceId}`
    : `chat:${source.chatId}`;
}

function watchedOutline(
  trigger: Extract<Trigger, { type: 'state' | 'event' | 'weather' | 'weather_kind' }>,
): Outline {
  const id = trigger.nodeId;
  switch (trigger.type) {
    case 'state':
      return watchOutline(id, {
        source: 'device',
        kind: 'state',
        subject: trigger.deviceId,
        field: trigger.capability,
        test: comparisonText(trigger.comparison),
      });
    case 'event':
      return watchOutline(id, { source: 'event', kind: trigger.kind, subject: trigger.deviceId });
    case 'weather':
      return watchOutline(id, {
        source: 'weather',
        kind: 'forecast',
        field: trigger.metric,
        test: comparisonText(trigger.comparison),
      });
    case 'weather_kind':
      return watchOutline(id, {
        source: 'weather',
        kind: 'forecast',
        field: 'kind',
        test: `in ${stable(trigger.kinds)}`,
      });
  }
}

function signalOutline(trigger: Extract<Trigger, { type: 'signal' }>): Outline {
  return watchOutline(trigger.nodeId, {
    source: trigger.source,
    kind: trigger.kind,
    subject: trigger.subject,
    field: trigger.field,
    match: stable(trigger.match),
    test: trigger.comparison === null ? null : comparisonText(trigger.comparison),
    window:
      trigger.window === null ? null : `${trigger.window.mode}:${String(trigger.window.seconds)}`,
    hold: trigger.holdSeconds,
    debounce: trigger.debounceSeconds,
    cooldown: trigger.cooldownSeconds,
  });
}

function timerOutline(trigger: Extract<Trigger, { type: 'time' | 'sun' | 'interval' }>): Outline {
  const id = trigger.nodeId ?? null;
  switch (trigger.type) {
    case 'time':
      return { timer: 'time', id, at: trigger.at, days: sortedDays(trigger.weekdays) };
    case 'sun':
      return { timer: 'sun', id, event: trigger.event, offset: trigger.offsetMinutes };
    case 'interval':
      return { timer: 'every', id, minutes: trigger.everyMinutes };
  }
}

function triggerOutlineV1(trigger: Trigger): Outline {
  if (trigger.type === 'time' || trigger.type === 'sun' || trigger.type === 'interval')
    return timerOutline(trigger);
  if (trigger.type === 'signal') return signalOutline(trigger);
  if (trigger.type !== 'speech') return watchedOutline(trigger);
  return {
    speech: trigger.phrase,
    id: trigger.nodeId ?? null,
    caseSensitive: trigger.caseSensitive,
    includeBots: trigger.includeBots,
    source: speechSource(trigger.source),
  };
}

interface Parts {
  readonly triggers: readonly Trigger[];
  readonly conditions: Conditions | null;
  readonly actions: readonly Action[];
  readonly parameters: AutomationSequenceDefinition['parameters'];
  readonly runPolicy?: AutomationDefinition['runPolicy'];
  readonly controlKey?: string | undefined;
}

function runText(policy: AutomationDefinition['runPolicy']): string {
  if (policy === undefined) return 'parallel';
  return 'limit' in policy ? `${policy.mode}:${String(policy.limit)}` : policy.mode;
}

function outlineOf(parts: Parts): Outline {
  const { conditions } = parts;
  const always =
    conditions === null || (conditions.mode === 'all' && conditions.items.length === 0);
  return {
    when: parts.triggers.map(triggerOutlineV1),
    onlyIf: always ? 'always' : conditionsTextV1(conditions),
    steps: parts.actions.map(stepOutlineV1),
    inputs: parts.parameters.map(
      (parameter) => `${parameter.name}:${INPUT_TYPE_OF[parameter.kind]}`,
    ),
    run: runText(parts.runPolicy),
    key: parts.controlKey ?? null,
  };
}

export function automationOutlineV1(definition: AutomationDefinition): Outline {
  return outlineOf({ ...definition, parameters: [] });
}

export function sequenceOutlineV1(definition: AutomationSequenceDefinition): Outline {
  return outlineOf({ ...definition, triggers: [], conditions: null });
}
