import {
  ApiError,
  AUTOMATION_V2,
  audioChangeFeature,
  capabilityOf,
  deviceEffectSupport,
  displayChangeFeature,
  deviceTargetOf,
  isFrom,
  planGroupCommands,
  skippedText,
  staticValueOf,
  targetCapability,
  walkSteps,
  type AutomationValueContent,
  type AutomationV2,
  type ConditionV2,
  type DeviceRow,
  type InputV2,
  type LeafStepV2,
  type OperandV2,
  type ValueDescriptor,
  type StepV2,
  type ToV2,
} from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { AutomationComputersSlot } from './automation-computers';
import { resolveTarget } from '../device-groups/commands';
import type { Store } from '../store/store';
import { definitionOf } from './definition';
import { effectMembers } from './temporary-effect';
import { messageOf } from '@smarteverything/logging';

type SetStepV2 = Extract<StepV2, { do: 'set' }>;
type ValueStepV2 = Extract<StepV2, { do: 'value' }>;
type ComputerStepV2 = Extract<StepV2, { do: 'audio' | 'display' }>;

interface Scope {
  readonly store: Store;
  readonly tools: ToolHub;
  readonly computers: Pick<AutomationComputersSlot, 'features'>;
  readonly inputs: ReadonlySet<string>;
}

const VALUE_OPERATIONS: Readonly<Record<AutomationValueContent['kind'], readonly string[]>> = {
  boolean: ['set', 'toggle'],
  number: ['set', 'add', 'subtract'],
  duration: ['set', 'add', 'subtract'],
  choice: ['set', 'next', 'previous'],
};

function attempt(problems: string[], label: string, check: () => void): void {
  try {
    check();
  } catch (cause) {
    problems.push(`${label}: ${messageOf(cause)}`);
  }
}

function operandProblem(scope: Scope, operand: OperandV2): void {
  if ('device' in operand) {
    const capability = capabilityOf(scope.store.devices.byId(operand.device), operand.control);
    if (
      capability === undefined ||
      capability.access === 'write' ||
      capability.value.kind === 'action'
    )
      throw new ApiError('invalid_request', `${operand.control} cannot be read from that device.`);
  } else if ('value' in operand) scope.store.automationValues.byId(operand.value);
  else if ('input' in operand && !scope.inputs.has(operand.input))
    throw new ApiError('invalid_request', `The automation declares no input ${operand.input}.`);
}

function inputProblem(scope: Scope, input: InputV2 | ToV2): void {
  if (isFrom(input)) operandProblem(scope, input.from);
  else if (typeof input === 'object' && input !== null && !Array.isArray(input))
    for (const field of Object.values(input)) inputProblem(scope, field);
}

function conditionProblem(scope: Scope, condition: ConditionV2): void {
  if ('all' in condition) for (const item of condition.all) conditionProblem(scope, item);
  else if ('any' in condition) for (const item of condition.any) conditionProblem(scope, item);
  else if ('not' in condition) conditionProblem(scope, condition.not);
  else if ('compare' in condition)
    operandProblem(scope, isFrom(condition.compare) ? condition.compare.from : condition.compare);
}

const CONTROLS_OF_VALUE: Readonly<
  Record<AutomationValueContent['kind'], readonly ValueDescriptor['kind'][]>
> = {
  boolean: ['boolean'],
  number: ['number'],
  duration: ['number'],
  choice: ['enum', 'text'],
};

function fitProblem(scope: Scope, devices: readonly DeviceRow[], step: SetStepV2): void {
  const { to } = step;
  if (to === undefined || !isFrom(to) || !('value' in to.from)) return;
  const content = scope.store.automationValues.byId(to.from.value).content;
  const kinds = devices.flatMap((device) => {
    const presented = targetCapability(device, step.control);
    return presented?.writable === true ? [presented.capability.value.kind] : [];
  });
  if (kinds.length > 0 && !kinds.some((kind) => CONTROLS_OF_VALUE[content.kind].includes(kind)))
    throw new ApiError(
      'invalid_request',
      `The ${content.kind} Value ${content.name} does not fit the control ${step.control}.`,
    );
}

function commandProblem(devices: readonly DeviceRow[], step: SetStepV2): void {
  const value = step.to === undefined ? undefined : staticValueOf(step.to);
  if (value === undefined) {
    if (!devices.some((device) => targetCapability(device, step.control)?.writable === true))
      throw new ApiError('invalid_request', 'No target device supports this control.');
    return;
  }
  const plan = planGroupCommands(
    devices.map((device) => ({ ...device, online: true })),
    {
      capability: step.control,
      value,
      ...(step.percent === true ? { scale: 'percent' as const } : {}),
    },
  );
  if (plan.commands.length === 0)
    throw new ApiError(
      'invalid_request',
      `No target device supports this command input: ${[...new Set(plan.skipped.map(skippedText))].join('; ')}`,
    );
}

function setProblem(scope: Scope, step: SetStepV2): void {
  const devices = resolveTarget(scope.store, deviceTargetOf(step.target));
  if (step.to !== undefined) inputProblem(scope, step.to);
  if (step.while !== undefined) conditionProblem(scope, step.while);
  if (step.for !== undefined && step.percent === true)
    throw new ApiError('invalid_request', 'A percentage does not apply to a temporary change.');
  if (devices.length === 0) return;
  fitProblem(scope, devices, step);
  if (step.for === undefined) commandProblem(devices, step);
  else temporaryProblem(scope, step);
}

function temporaryProblem(scope: Scope, step: SetStepV2): void {
  const target = deviceTargetOf(step.target);
  const value = step.to === undefined ? undefined : staticValueOf(step.to);
  if (value === undefined) {
    const supported = resolveTarget(scope.store, target).some((device) => {
      const presented = targetCapability(device, step.control);
      return presented !== undefined && deviceEffectSupport(presented.capability) === null;
    });
    if (!supported)
      throw new ApiError('invalid_request', 'No target device supports this temporary change.');
    return;
  }
  const operation = { type: 'set' as const, value };
  if (effectMembers(scope.store, { target, control: step.control, operation }).members.length === 0)
    throw new ApiError('invalid_request', 'No target device supports this temporary change.');
}

function valueProblem(scope: Scope, step: ValueStepV2): void {
  const content = scope.store.automationValues.byId(step.value).content;
  if (!VALUE_OPERATIONS[content.kind].includes(step.op))
    throw new ApiError('invalid_request', `The Value ${content.name} does not accept ${step.op}.`);
  if (step.amount !== undefined) inputProblem(scope, step.amount);
  if (
    content.kind === 'choice' &&
    step.op === 'set' &&
    step.amount !== undefined &&
    !isFrom(step.amount) &&
    !content.choices.some((choice) => choice.id === step.amount)
  )
    throw new ApiError('invalid_request', 'Selected Value choice does not exist.');
}

function toolProblem(scope: Scope, step: Extract<StepV2, { do: 'tool' }>): void {
  const check = scope.tools.check(step.tool, step.args ?? {});
  if (!check.ok)
    throw new ApiError('invalid_request', `${step.tool} would be refused: ${check.reason}`);
}

function computerProblem(scope: Scope, step: Extract<StepV2, { do: 'audio' | 'display' }>): void {
  const device = scope.store.devices.byId(step.computer);
  if (device.kind !== 'computer')
    throw new ApiError('invalid_request', `${device.name} is not a computer.`);
  const feature =
    step.do === 'audio' ? audioChangeFeature(step.change) : displayChangeFeature(step.change);
  const offered = scope.computers.features(device.id);
  if (offered !== null && !offered.includes(feature))
    throw new ApiError(
      'invalid_request',
      `${device.name} does not offer ${feature.replaceAll('_', ' ')}.`,
    );
}

function callProblem(scope: Scope, step: Extract<StepV2, { do: 'run' }>): void {
  const callee = definitionOf(scope.store.automations.byId(step.automation));
  for (const input of Object.values(step.inputs ?? {})) inputProblem(scope, input);
  const declared = new Set((callee.inputs ?? []).map((input) => input.name));
  const given = Object.keys(step.inputs ?? {});
  if (given.length !== declared.size || given.some((name) => !declared.has(name)))
    throw new ApiError('invalid_request', 'The inputs do not match what the automation declares.');
}

function stopProblem(scope: Scope, step: Extract<StepV2, { do: 'stop' }>): void {
  if (step.automation !== undefined) scope.store.automations.byId(step.automation);
}

function leafProblem(scope: Scope, step: Exclude<LeafStepV2, ComputerStepV2>): void {
  switch (step.do) {
    case 'set':
      setProblem(scope, step);
      return;
    case 'scene':
      scope.store.scenes.byId(step.scene);
      return;
    case 'tool':
      toolProblem(scope, step);
      return;
    case 'value':
      valueProblem(scope, step);
      return;
    case 'run':
      callProblem(scope, step);
      return;
    case 'stop':
      stopProblem(scope, step);
      return;
    case 'wait':
    case 'notify':
    case 'ai':
      return;
  }
}

function stepProblem(scope: Scope, step: StepV2): void {
  if (step.do === 'if') for (const branch of step.branches) conditionProblem(scope, branch.when);
  else if (step.do === 'repeat') {
    for (const condition of [step.while, step.until])
      if (condition !== undefined) conditionProblem(scope, condition);
  } else if (step.do === 'audio' || step.do === 'display') computerProblem(scope, step);
  else leafProblem(scope, step);
}

function labelled(steps: readonly StepV2[], path: string): readonly (readonly [string, StepV2])[] {
  return steps.flatMap((step, index) => {
    const here = path === '' ? String(index + 1) : `${path}.${String(index + 1)}`;
    return [[here, step] as const, ...labelled(childSteps(step), here)];
  });
}

function childSteps(step: StepV2): readonly StepV2[] {
  if (step.do === 'if')
    return [...step.branches.flatMap((branch) => branch.then), ...(step.else ?? [])];
  return step.do === 'repeat' ? step.steps : [];
}

function reaches(store: Store, from: AutomationV2, target: string, seen: Set<string>): boolean {
  return walkSteps(from.steps).some((step) => {
    if (step.do !== 'run' || seen.has(step.automation)) return false;
    seen.add(step.automation);
    if (step.automation === target) return true;
    const row = store.automations.find(step.automation);
    const parsed = row === undefined ? undefined : AUTOMATION_V2.safeParse(row.definition);
    return parsed?.success === true && reaches(store, parsed.data, target, seen);
  });
}

export function validateAutomation(
  scopeOf: Pick<Scope, 'store' | 'tools' | 'computers'>,
  automation: AutomationV2,
  ownId?: string,
): void {
  const scope: Scope = {
    ...scopeOf,
    inputs: new Set((automation.inputs ?? []).map((input) => input.name)),
  };
  const problems: string[] = [];
  if (automation.onlyIf !== undefined) {
    const { onlyIf } = automation;
    attempt(problems, 'Only if', () => {
      conditionProblem(scope, onlyIf);
    });
  }
  for (const [path, step] of labelled(automation.steps, '')) {
    attempt(problems, `Step ${path} (${step.do})`, () => {
      stepProblem(scope, step);
    });
  }
  if (ownId !== undefined && reaches(scope.store, automation, ownId, new Set()))
    problems.push('Automations must not run each other in a circle');
  if (problems.length > 0)
    throw new ApiError(
      'invalid_request',
      `Nothing was saved. ${problems.join('; ')}. Fix these and save again.`,
    );
}
