import { isFrom } from './automation-v2-eval';
import {
  walkSteps,
  type AutomationV2,
  type ConditionV2,
  type FromV2,
  type InputV2,
  type OperandV2,
  type StepV2,
  type TargetV2,
  type ToV2,
  type TriggerV2,
} from './automation-v2-schema';
import type { JsonValue } from './values';

type Found = Set<string>;

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function literalStrings(value: JsonValue, found: Found): void {
  if (typeof value === 'string') found.add(value);
  else if (isList(value)) for (const entry of value) literalStrings(entry, found);
  else if (typeof value === 'object' && value !== null)
    for (const entry of Object.values(value)) literalStrings(entry, found);
}

function operandReferences(operand: OperandV2, found: Found): void {
  if ('device' in operand) found.add(operand.device);
  else if ('value' in operand) found.add(operand.value);
  else if ('literal' in operand) literalStrings(operand.literal, found);
}

function fromReferences(from: FromV2, found: Found): void {
  operandReferences(from.from, found);
}

function inputReferences(input: InputV2, found: Found): void {
  if (isFrom(input)) fromReferences(input, found);
  else literalStrings(input, found);
}

function toReferences(to: ToV2, found: Found): void {
  if (isFrom(to)) fromReferences(to, found);
  else if (typeof to === 'object' && to !== null && !Array.isArray(to))
    for (const field of Object.values(to)) inputReferences(field, found);
  else literalStrings(to, found);
}

function conditionReferences(condition: ConditionV2, found: Found): void {
  if ('all' in condition || 'any' in condition) {
    for (const item of 'all' in condition ? condition.all : condition.any)
      conditionReferences(item, found);
  } else if ('not' in condition) conditionReferences(condition.not, found);
  else if ('compare' in condition) {
    if ('from' in condition.compare) fromReferences(condition.compare, found);
    else operandReferences(condition.compare, found);
    if ('to' in condition.test) literalStrings(condition.test.to, found);
  }
}

function targetReferences(target: TargetV2, found: Found): void {
  if ('device' in target) found.add(target.device);
  else if ('devices' in target) for (const id of target.devices) found.add(id);
  else if ('room' in target) found.add(target.room);
  else found.add(target.group);
}

function optionalCondition(condition: ConditionV2 | undefined, found: Found): void {
  if (condition !== undefined) conditionReferences(condition, found);
}

function deviceStepReferences(step: StepV2, found: Found): void {
  if (step.do === 'set') {
    targetReferences(step.target, found);
    if (step.to !== undefined) toReferences(step.to, found);
    optionalCondition(step.while, found);
  } else if (step.do === 'scene') found.add(step.scene);
  else if (step.do === 'ai') {
    found.add(step.person);
    if (step.chat !== undefined) found.add(step.chat);
  } else if (step.do === 'tool') found.add(step.person);
  else if (step.do === 'audio' || step.do === 'display') found.add(step.computer);
}

function programStepReferences(step: StepV2, found: Found): void {
  if (step.do === 'value') {
    found.add(step.value);
    if (step.amount !== undefined) inputReferences(step.amount, found);
  } else if (step.do === 'run') {
    found.add(step.automation);
    for (const input of Object.values(step.inputs ?? {})) inputReferences(input, found);
  } else if (step.do === 'stop' && step.automation !== undefined) found.add(step.automation);
}

function flowStepReferences(step: StepV2, found: Found): void {
  if (step.do === 'if') for (const branch of step.branches) conditionReferences(branch.when, found);
  else if (step.do === 'repeat') {
    optionalCondition(step.while, found);
    optionalCondition(step.until, found);
  }
}

function stepReferences(step: StepV2, found: Found): void {
  deviceStepReferences(step, found);
  programStepReferences(step, found);
  flowStepReferences(step, found);
}

function triggerReferences(trigger: TriggerV2, found: Found): void {
  if (trigger.on === 'signal' && trigger.subject !== undefined) found.add(trigger.subject);
  if (trigger.on !== 'speech' || trigger.source === undefined) return;
  const { source } = trigger;
  if ('camera' in source) found.add(source.camera);
  else if ('chat' in source) found.add(source.chat);
}

export function automationReferenceIds(automation: AutomationV2): ReadonlySet<string> {
  const found: Found = new Set();
  for (const trigger of automation.when) triggerReferences(trigger, found);
  optionalCondition(automation.onlyIf, found);
  for (const step of walkSteps(automation.steps)) stepReferences(step, found);
  return found;
}

export function automationReferences(automation: AutomationV2, id: string): boolean {
  return automationReferenceIds(automation).has(id);
}
