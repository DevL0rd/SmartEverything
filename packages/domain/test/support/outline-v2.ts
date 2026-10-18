import type { AutomationV2, StepV2, TriggerV2 } from '../../src/automation-v2-schema';
import { conditionTextV2, inputTextV2, targetTextV2, testText, toTextV2 } from './outline-v2-expr';
import {
  ALL_DAYS,
  setOutline,
  sortedDays,
  stable,
  watchOutline,
  type SetParts,
  type Outline,
} from './outline-text';

export type SetStep = Extract<StepV2, { do: 'set' }>;
type FlowStep = Extract<StepV2, { do: 'if' | 'repeat' }>;
type SimpleStep = Exclude<StepV2, SetStep | FlowStep>;

export function setPartsV2(step: SetStep): SetParts {
  return {
    id: step.id,
    target: targetTextV2(step.target),
    control: step.control,
    to: step.to === undefined ? null : toTextV2(step.to),
    by: step.by ?? null,
    percent: step.percent ?? false,
    duration: step.for ?? null,
    whileText: step.while === undefined ? null : conditionTextV2(step.while),
    priority: step.priority ?? 0,
  };
}

function flowOutline(step: FlowStep): Outline {
  const id = step.id ?? null;
  if (step.do === 'if')
    return {
      step: 'if',
      id,
      branches: step.branches.map((branch) => ({
        id: branch.id ?? null,
        when: conditionTextV2(branch.when),
        then: branch.then.map(stepOutlineV2),
      })),
      else: step.else?.map(stepOutlineV2) ?? null,
    };
  return {
    step: 'repeat',
    id,
    times: step.times ?? null,
    while: step.while === undefined ? null : conditionTextV2(step.while),
    until: step.until === undefined ? null : conditionTextV2(step.until),
    gapMs: step.gapMs ?? null,
    limitMs: step.limitMs ?? null,
    steps: step.steps.map(stepOutlineV2),
  };
}

function runOutline(step: Extract<StepV2, { do: 'run' }>): Outline {
  return {
    step: 'run',
    id: step.id ?? null,
    automation: step.automation,
    inputs: Object.fromEntries(
      Object.entries(step.inputs ?? {}).map(([name, input]) => [name, inputTextV2(input)]),
    ),
    wait: step.wait ?? false,
  };
}

function valueOutline(step: Extract<StepV2, { do: 'value' }>): Outline {
  return {
    step: 'value',
    id: step.id ?? null,
    value: step.value,
    op: step.op,
    amount: step.amount === undefined ? null : inputTextV2(step.amount),
  };
}

function peopleOutline(step: Extract<StepV2, { do: 'ai' | 'tool' }>): Outline {
  const id = step.id ?? null;
  return step.do === 'ai'
    ? {
        step: 'ai',
        id,
        person: step.person,
        chat: step.chat ?? null,
        instruction: step.instruction,
      }
    : { step: 'tool', id, person: step.person, tool: step.tool, args: stable(step.args ?? {}) };
}

function basicOutline(
  step: Extract<StepV2, { do: 'scene' | 'wait' | 'notify' | 'stop' }>,
): Outline {
  const id = step.id ?? null;
  switch (step.do) {
    case 'scene':
      return { step: 'scene', id, scene: step.scene };
    case 'wait':
      return { step: 'wait', id, ms: step.ms };
    case 'notify':
      return { step: 'notify', id, message: step.message };
    case 'stop':
      return { step: 'stop', id, automation: step.automation ?? null, key: step.key ?? null };
  }
}

function computerOutline(step: Extract<StepV2, { do: 'audio' | 'display' }>): Outline {
  const id = step.id ?? null;
  return step.do === 'audio'
    ? { step: 'audio', id, computer: step.computer, change: stable(step.change) }
    : {
        step: 'display',
        id,
        computer: step.computer,
        change: stable(step.change),
        keep: step.keep ?? false,
      };
}

function simpleOutline(step: SimpleStep): Outline {
  if (step.do === 'ai' || step.do === 'tool') return peopleOutline(step);
  if (step.do === 'audio' || step.do === 'display') return computerOutline(step);
  if (step.do === 'value') return valueOutline(step);
  return step.do === 'run' ? runOutline(step) : basicOutline(step);
}

export function stepOutlineV2(step: StepV2): Outline {
  if (step.do === 'set') return setOutline(setPartsV2(step));
  return step.do === 'if' || step.do === 'repeat' ? flowOutline(step) : simpleOutline(step);
}

function speechSource(source: Extract<TriggerV2, { on: 'speech' }>['source']): string | null {
  if (source === undefined) return null;
  if ('camera' in source) return `camera:${source.camera}`;
  if ('phone' in source) return `phone:${source.phone}`;
  if ('computer' in source) return `computer:${source.computer}`;
  return 'plugin' in source ? `plugin:${source.plugin}:${source.sourceId}` : `chat:${source.chat}`;
}

function signalOutline(trigger: Extract<TriggerV2, { on: 'signal' }>): Outline {
  const { window } = trigger;
  return watchOutline(trigger.id, {
    source: trigger.source,
    kind: trigger.kind,
    subject: trigger.subject ?? null,
    field: trigger.field ?? null,
    match: stable(trigger.match ?? {}),
    test: trigger.test === undefined ? null : testText(trigger.test),
    window: window === undefined ? null : `${window.of}:${String(window.seconds)}`,
    hold: trigger.holdSeconds ?? 0,
    debounce: trigger.debounceSeconds ?? 0,
    cooldown: trigger.cooldownSeconds ?? 0,
  });
}

function speechOutline(trigger: Extract<TriggerV2, { on: 'speech' }>): Outline {
  return {
    speech: trigger.phrase,
    id: trigger.id ?? null,
    caseSensitive: trigger.caseSensitive ?? false,
    includeBots: trigger.includeBots ?? false,
    source: speechSource(trigger.source),
  };
}

function triggerOutlineV2(trigger: TriggerV2): Outline {
  const id = trigger.id ?? null;
  switch (trigger.on) {
    case 'time':
      return { timer: 'time', id, at: trigger.at, days: sortedDays(trigger.days ?? ALL_DAYS) };
    case 'sun':
      return { timer: 'sun', id, event: trigger.event, offset: trigger.offsetMinutes ?? 0 };
    case 'every':
      return { timer: 'every', id, minutes: trigger.minutes };
    case 'signal':
      return signalOutline(trigger);
    case 'speech':
      return speechOutline(trigger);
  }
}

export function automationOutlineV2(automation: AutomationV2): Outline {
  return {
    when: automation.when.map(triggerOutlineV2),
    onlyIf: automation.onlyIf === undefined ? 'always' : conditionTextV2(automation.onlyIf),
    steps: automation.steps.map(stepOutlineV2),
    inputs: (automation.inputs ?? []).map((input) => `${input.name}:${input.type}`),
    run: `${automation.mode ?? 'single'}${automation.max === undefined ? '' : `:${String(automation.max)}`}`,
    key: automation.key ?? null,
  };
}
