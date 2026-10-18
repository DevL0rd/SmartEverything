import {
  humanizeEnum,
  isFrom,
  staticValueOf,
  type InputV2,
  type StepV2,
  type ToV2,
} from '@smarteverything/domain';
import {
  automationName,
  deviceName,
  operandName,
  personName,
  targetPhrase,
  valueName,
  type Names,
} from './describe-names';
import { durationText, literalText } from './describe-values';
import { subjectLabel, subjectOf, subjectValue } from './present';
import { describeAudioStep, describeDisplayStep } from './describe-computer-steps';
import { describeCondition } from './describe-conditions';
import { fieldInputs } from './inputs';
import { speechOf } from './speak-step';
import { isFlowStep, type FlowStep } from './steps';

type Step<K extends StepV2['do']> = Extract<StepV2, { do: K }>;

function offsetText(from: Extract<InputV2, { from: unknown }>): string {
  const parts: string[] = [];
  if (from.add !== undefined && from.add !== 0)
    parts.push(from.add < 0 ? `minus ${String(-from.add)}` : `plus ${String(from.add)}`);
  if (from.min !== undefined) parts.push(`at least ${String(from.min)}`);
  if (from.max !== undefined) parts.push(`at most ${String(from.max)}`);
  return parts.join(', ');
}

function inputPhrase(names: Names, input: InputV2): string {
  if (!isFrom(input)) return literalText(names, null, input);
  const offset = offsetText(input);
  const base = operandName(names, input.from);
  return offset === '' ? base : `${base} ${offset}`;
}

function toPhrase(names: Names, step: Step<'set'>, to: ToV2): string {
  if (isFrom(to)) return inputPhrase(names, to);
  const literal = staticValueOf(to);
  if (literal === undefined) {
    const fields = Object.keys(fieldInputs(to));
    return `${String(fields.length)} computed argument${fields.length === 1 ? '' : 's'}`;
  }
  if (typeof literal === 'object' && literal !== null) return 'the chosen arguments';
  if ('device' in step.target) {
    const subject = subjectOf(names.devices, step.target.device, step.control);
    return subjectValue(subject, literal);
  }
  return literalText(names, null, literal) + (step.percent === true ? '%' : '');
}

function controlLabel(names: Names, step: Step<'set'>): string {
  if ('device' in step.target) {
    const subject = subjectOf(names.devices, step.target.device, step.control);
    if (subject.capability !== undefined) return subjectLabel(subject);
  }
  return humanizeEnum(step.control).toLowerCase();
}

function temporaryPhrase(names: Names, step: Step<'set'>, length: number): string {
  const target = targetPhrase(names, step.target);
  const label = controlLabel(names, step);
  const change =
    step.to === undefined
      ? `change ${label} on ${target} by ${String(step.by ?? 0)}`
      : `set ${label} on ${target} to ${toPhrase(names, step, step.to)}`;
  return `temporarily ${change} for ${durationText(length)}`;
}

function singleDevicePhrase(names: Names, step: Step<'set'>, device: string): string | null {
  const target = deviceName(names, device);
  if (step.control === 'power' && typeof step.to === 'boolean')
    return `turn ${step.to ? 'on' : 'off'} ${target}`;
  const subject = subjectOf(names.devices, device, step.control);
  return subject.capability?.value.kind === 'action'
    ? `${controlLabel(names, step)} on ${target}`
    : null;
}

function setPhrase(names: Names, step: Step<'set'>): string {
  if (step.for !== undefined) return temporaryPhrase(names, step, step.for);
  const target = targetPhrase(names, step.target);
  const label = controlLabel(names, step);
  const single = 'device' in step.target ? step.target.device : null;
  const special = single === null ? null : singleDevicePhrase(names, step, single);
  if (special !== null) return special;
  const value = step.to === undefined ? '' : toPhrase(names, step, step.to);
  return single === null
    ? `set ${label} on ${target} to ${value}`
    : `set ${target} ${label} to ${value}`;
}

function valuePhrase(names: Names, step: Step<'value'>): string {
  const name = valueName(names, step.value);
  const amount = step.amount === undefined ? '' : inputPhrase(names, step.amount);
  switch (step.op) {
    case 'set':
      return `set ${name} to ${amount}`;
    case 'add':
      return `add ${amount} to ${name}`;
    case 'subtract':
      return `subtract ${amount} from ${name}`;
    case 'toggle':
      return `toggle ${name}`;
    case 'next':
      return `move ${name} to the next choice`;
    case 'previous':
      return `move ${name} to the previous choice`;
  }
}

function ifPhrase(names: Names, step: Step<'if'>): string {
  const first = step.branches[0];
  const others = step.branches.length - 1;
  const lead = first === undefined ? 'check' : `if ${describeCondition(names, first.when)}`;
  const more = others > 0 ? `, or ${String(others)} other case${others === 1 ? '' : 's'}` : '';
  return `${lead}${more}${step.else === undefined ? '' : ', otherwise something else'}`;
}

function repeatPhrase(names: Names, step: Step<'repeat'>): string {
  const how =
    step.times !== undefined
      ? `${String(step.times)} times`
      : step.while !== undefined
        ? `while ${describeCondition(names, step.while)}`
        : `until ${step.until === undefined ? 'told to stop' : describeCondition(names, step.until)}`;
  return `repeat ${how}${step.limitMs === undefined ? '' : `, for at most ${durationText(step.limitMs)}`}`;
}

function stopPhrase(names: Names, step: Step<'stop'>): string {
  return step.automation === undefined
    ? 'stop this run'
    : `stop ${automationName(names, step.automation)}`;
}

function aiPhrase(names: Names, step: Step<'ai'>): string {
  const chat =
    step.chat === undefined
      ? 'a new chat'
      : `“${names.chats.find((row) => row.id === step.chat)?.title ?? 'a chat'}”`;
  return `wake ${personName(names, step.person)}’s AI in ${chat}`;
}

function toolPhrase(names: Names, step: Step<'tool'>): string {
  const speech = speechOf(step);
  if (speech === null) return `use the tool “${toolLabel(step.tool)}”`;
  const words = speech.text.trim();
  return `say ${words === '' ? 'something' : `“${words}”`} on ${deviceName(names, speech.deviceId)}`;
}

function toolLabel(tool: string): string {
  return tool.replaceAll('_', ' ');
}

function scenePhrase(names: Names, sceneId: string): string {
  return `run ${names.scenes.find((scene) => scene.id === sceneId)?.name ?? 'a deleted scene'}`;
}

function noticePhrase(message: string): string {
  const text = message.trim();
  return text === '' ? 'send a notice' : `send “${text}”`;
}

function flowPhrase(names: Names, step: FlowStep): string {
  switch (step.do) {
    case 'value':
      return valuePhrase(names, step);
    case 'if':
      return ifPhrase(names, step);
    case 'repeat':
      return repeatPhrase(names, step);
    case 'run':
      return `run ${automationName(names, step.automation)}${step.wait === true ? ' and wait for it' : ''}`;
    case 'stop':
      return stopPhrase(names, step);
  }
}

export function describeStep(names: Names, step: StepV2): string {
  if (isFlowStep(step)) return flowPhrase(names, step);
  switch (step.do) {
    case 'set':
      return setPhrase(names, step);
    case 'scene':
      return scenePhrase(names, step.scene);
    case 'wait':
      return `wait ${durationText(step.ms)}`;
    case 'notify':
      return noticePhrase(step.message);
    case 'ai':
      return aiPhrase(names, step);
    case 'tool':
      return toolPhrase(names, step);
    case 'audio':
      return describeAudioStep(names, step);
    case 'display':
      return describeDisplayStep(names, step);
  }
}

export function describeSteps(names: Names, steps: readonly StepV2[]): string[] {
  return steps.map((step) => describeStep(names, step));
}
