import {
  checkValue,
  isFrom,
  staticValueOf,
  type ConditionV2,
  type OperandV2,
  type StepV2,
  type TargetV2,
  type TriggerV2,
} from '@smarteverything/domain';
import { rawErrorText } from '../../../format/errors';
import type { DeviceLike } from './capability-choices';
import type { Callable } from './reusable-steps';
import { isComputerStep } from './computer-steps';
import { computerProblems } from './validate-computer-steps';
import { speechOf } from './speak-step';
import { isFlowStep, type FlowStep } from './steps';

export interface ValidationChoices {
  readonly devices: readonly DeviceLike[];
  readonly sceneIds: readonly string[];
  readonly profileIds: readonly string[];
  readonly valueIds: readonly string[];
  readonly groupIds: readonly string[];
  readonly roomIds: readonly string[];
  readonly automationIds: readonly string[];
  readonly callable: readonly Callable[];
  readonly inputs: readonly string[];
}

const GONE_DEVICE = 'uses a device that is no longer here';

function deviceProblem(choices: ValidationChoices, deviceId: string): string | null {
  return choices.devices.some((device) => device.id === deviceId) ? null : GONE_DEVICE;
}

function readingProblem(
  choices: ValidationChoices,
  deviceId: string,
  control: string,
): string | null {
  const device = choices.devices.find((candidate) => candidate.id === deviceId);
  if (device === undefined) return GONE_DEVICE;
  return device.capabilities.some((capability) => capability.key === control)
    ? null
    : `${device.label} can no longer do this`;
}

export function triggerProblem(choices: ValidationChoices, trigger: TriggerV2): string | null {
  if (trigger.on === 'speech')
    return trigger.phrase.trim() === '' ? 'Write the words to listen for.' : null;
  if (trigger.on !== 'signal' || trigger.subject === undefined) return null;
  if (trigger.source === 'device' && trigger.kind === 'state' && trigger.field !== undefined)
    return readingProblem(choices, trigger.subject, trigger.field);
  return trigger.source === 'event' ? deviceProblem(choices, trigger.subject) : null;
}

function operandProblem(choices: ValidationChoices, operand: OperandV2): string | null {
  if ('device' in operand) return readingProblem(choices, operand.device, operand.control);
  if ('value' in operand)
    return choices.valueIds.includes(operand.value) ? null : 'uses a Value that was deleted';
  if ('input' in operand)
    return choices.inputs.includes(operand.input) ? null : 'uses an input that is not declared';
  return null;
}

export function conditionProblems(
  choices: ValidationChoices,
  condition: ConditionV2,
): readonly string[] {
  if ('all' in condition) return condition.all.flatMap((item) => conditionProblems(choices, item));
  if ('any' in condition) return condition.any.flatMap((item) => conditionProblems(choices, item));
  if ('not' in condition) return conditionProblems(choices, condition.not);
  if (!('compare' in condition)) return [];
  const subject = isFrom(condition.compare) ? condition.compare.from : condition.compare;
  const problem = operandProblem(choices, subject);
  return problem === null ? [] : [problem];
}

function targetDeviceIds(target: TargetV2): readonly string[] {
  if ('device' in target) return [target.device];
  return 'devices' in target ? target.devices : [];
}

function targetProblem(choices: ValidationChoices, target: TargetV2): string | null {
  if ('group' in target)
    return choices.groupIds.includes(target.group) ? null : 'controls a group that was deleted';
  if ('room' in target)
    return choices.roomIds.includes(target.room) ? null : 'controls a room that was deleted';
  if ('devices' in target && target.devices.length === 0) return 'Pick at least one device.';
  const gone = targetDeviceIds(target).some((id) => deviceProblem(choices, id) !== null);
  return gone ? GONE_DEVICE : null;
}

function literalProblem(
  choices: ValidationChoices,
  step: Extract<StepV2, { do: 'set' }>,
): string | null {
  if (!('device' in step.target) || step.to === undefined || step.for !== undefined) return null;
  const literal = staticValueOf(step.to);
  const deviceId = step.target.device;
  const device = choices.devices.find((candidate) => candidate.id === deviceId);
  const capability = device?.capabilities.find((candidate) => candidate.key === step.control);
  if (literal === undefined || capability === undefined || capability.value.kind === 'action')
    return null;
  try {
    checkValue(capability.value, literal);
    return null;
  } catch (error) {
    return rawErrorText(error);
  }
}

function setProblems(choices: ValidationChoices, step: Extract<StepV2, { do: 'set' }>): string[] {
  const found = [targetProblem(choices, step.target)];
  if ('device' in step.target)
    found.push(readingProblem(choices, step.target.device, step.control));
  found.push(literalProblem(choices, step));
  if (step.to !== undefined && isFrom(step.to)) found.push(operandProblem(choices, step.to.from));
  if (step.while !== undefined) found.push(...conditionProblems(choices, step.while));
  return found.filter((problem) => problem !== null);
}

function runProblems(choices: ValidationChoices, step: Extract<StepV2, { do: 'run' }>): string[] {
  const callee = choices.callable.find((entry) => entry.id === step.automation);
  if (callee === undefined) return ['runs an automation that was deleted'];
  const given = step.inputs ?? {};
  return callee.inputs
    .filter((input) => given[input.name] === undefined)
    .map((input) => `Give a value for “${input.name}”.`);
}

function branchProblems(choices: ValidationChoices, step: Extract<StepV2, { do: 'if' }>): string[] {
  return step.branches.flatMap((branch) => conditionProblems(choices, branch.when));
}

function aiProblems(choices: ValidationChoices, step: Extract<StepV2, { do: 'ai' }>): string[] {
  return [
    ...(choices.profileIds.includes(step.person)
      ? []
      : ['wakes the AI for someone who was removed']),
    ...(step.instruction.trim() === '' ? ['Write what the AI should do.'] : []),
  ];
}

function toolStepProblems(
  choices: ValidationChoices,
  step: Extract<StepV2, { do: 'tool' }>,
): string[] {
  const speech = speechOf(step);
  return [
    ...(choices.profileIds.includes(step.person)
      ? []
      : ['uses a tool for someone who was removed']),
    ...(step.tool === '' ? ['Pick the tool to use.'] : []),
    ...(speech !== null && speech.text.trim() === '' ? ['Write what to say.'] : []),
    ...(speech !== null && !choices.devices.some((device) => device.id === speech.deviceId)
      ? [GONE_DEVICE]
      : []),
  ];
}

function stopProblems(choices: ValidationChoices, step: Extract<StepV2, { do: 'stop' }>): string[] {
  return step.automation === undefined || choices.automationIds.includes(step.automation)
    ? []
    : ['stops an automation that was deleted'];
}

function flowProblems(choices: ValidationChoices, step: FlowStep): readonly string[] {
  switch (step.do) {
    case 'value':
      return choices.valueIds.includes(step.value) ? [] : ['changes a Value that was deleted'];
    case 'run':
      return runProblems(choices, step);
    case 'if':
      return branchProblems(choices, step);
    case 'repeat':
      return [step.while, step.until]
        .filter((condition) => condition !== undefined)
        .flatMap((condition) => conditionProblems(choices, condition));
    case 'stop':
      return stopProblems(choices, step);
  }
}

type LeafStep = Extract<StepV2, { do: 'set' | 'scene' | 'notify' | 'ai' | 'wait' | 'tool' }>;

function leafProblems(choices: ValidationChoices, step: LeafStep): readonly string[] {
  switch (step.do) {
    case 'set':
      return setProblems(choices, step);
    case 'scene':
      return choices.sceneIds.includes(step.scene) ? [] : ['runs a scene that was deleted'];
    case 'notify':
      return step.message.trim() === '' ? ['Write the message to send.'] : [];
    case 'ai':
      return aiProblems(choices, step);
    case 'tool':
      return toolStepProblems(choices, step);
    case 'wait':
      return [];
  }
}

export function stepProblems(choices: ValidationChoices, step: StepV2): readonly string[] {
  if (isFlowStep(step)) return flowProblems(choices, step);
  if (isComputerStep(step)) return computerProblems(choices, step);
  return leafProblems(choices, step);
}
