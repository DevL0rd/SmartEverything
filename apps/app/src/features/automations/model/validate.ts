import {
  AUTOMATION_DEFINITION,
  checkValue,
  validateCommand,
  type Action,
  type AutomationDefinition,
  type Comparison,
  type Condition,
  type DeviceCapability,
  type Trigger,
} from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';
import { baseOf } from './signal-triggers';
import { definitionOf, type Draft } from './editor-state';
import { rawErrorText } from '../../../format/errors';

export const NAME_LIMIT = 80;

type Block = 'name' | 'when' | 'only' | 'then';

export type Problems = Readonly<Record<Block, readonly string[]>>;

export type Validation =
  | { readonly valid: true; readonly name: string; readonly definition: AutomationDefinition }
  | { readonly valid: false; readonly problems: Problems };

export interface ValidationChoices {
  readonly devices: readonly DeviceLike[];
  readonly sceneIds: readonly string[];
  readonly profileIds: readonly string[];
}

const BLOCK_OF: Readonly<Record<string, Block>> = {
  triggers: 'when',
  conditions: 'only',
  actions: 'then',
};

const EMPTY: Readonly<Record<Block, string>> = {
  name: 'Give it a name.',
  when: 'Add when it runs.',
  only: 'Add a condition, or match all.',
  then: 'Add what it does.',
};

const GONE_DEVICE = 'uses a device that is no longer here';

const FIELD_TEXT: Readonly<Record<string, string>> = {
  instruction: 'Write what the AI should do.',
  message: 'Write the message to send.',
};

interface Issue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function blockOf(issue: Issue): Block {
  const [part] = issue.path;
  return typeof part === 'string' ? (BLOCK_OF[part] ?? 'when') : 'when';
}

function positionOf(issue: Issue): number | null {
  const [part, second, third] = issue.path;
  const index = part === 'conditions' ? third : second;
  return typeof index === 'number' ? index + 1 : null;
}

function fieldText(issue: Issue): string {
  const field = issue.path[issue.path.length - 1];
  const text = typeof field === 'string' ? FIELD_TEXT[field] : undefined;
  return text ?? issue.message;
}

function issueText(issue: Issue): string {
  const position = positionOf(issue);
  if (position === null) {
    return issue.code === 'too_small' ? EMPTY[blockOf(issue)] : issue.message;
  }
  return `${String(position)}. ${fieldText(issue)}`;
}

type Found =
  | { readonly problem: string }
  | { readonly capability: DeviceCapability; readonly device: DeviceLike };

function capabilityFound(devices: readonly DeviceLike[], deviceId: string, key: string): Found {
  const device = devices.find((candidate) => candidate.id === deviceId);
  if (device === undefined) {
    return { problem: GONE_DEVICE };
  }
  const capability = device.capabilities.find((candidate) => candidate.key === key);
  return capability === undefined
    ? { problem: `${device.label} can no longer do this` }
    : { capability, device };
}

function comparisonProblem(capability: DeviceCapability, comparison: Comparison): string | null {
  if (comparison.operator !== 'eq' && comparison.operator !== 'ne') {
    return null;
  }
  try {
    checkValue(capability.value, comparison.value);
    return null;
  } catch (error) {
    return rawErrorText(error);
  }
}

function stateProblem(
  devices: readonly DeviceLike[],
  item: { readonly deviceId: string; readonly capability: string; readonly comparison: Comparison },
): string | null {
  const found = capabilityFound(devices, item.deviceId, item.capability);
  return 'problem' in found ? found.problem : comparisonProblem(found.capability, item.comparison);
}

function triggerProblem(devices: readonly DeviceLike[], trigger: Trigger): string | null {
  const base = trigger.type === 'signal' ? baseOf(trigger) : trigger;
  return base === null ? null : untimedProblem(devices, base);
}

function untimedProblem(devices: readonly DeviceLike[], trigger: Trigger): string | null {
  if (trigger.type === 'state') {
    return stateProblem(devices, trigger);
  }
  if (trigger.type === 'event' && trigger.deviceId !== null) {
    const id = trigger.deviceId;
    return devices.some((device) => device.id === id) ? null : GONE_DEVICE;
  }
  return null;
}

function conditionProblem(devices: readonly DeviceLike[], condition: Condition): string | null {
  return condition.type === 'state' ? stateProblem(devices, condition) : null;
}

function actionProblem(choices: ValidationChoices, action: Action): string | null {
  if (action.type === 'scene') {
    return choices.sceneIds.includes(action.sceneId) ? null : 'runs a scene that was deleted';
  }
  if (action.type === 'notify') {
    return action.message.trim() === '' ? 'Write the message to send.' : null;
  }
  if (action.type === 'wake_ai') {
    return choices.profileIds.includes(action.profileId)
      ? null
      : 'wakes the AI for someone who was removed';
  }
  if (action.type !== 'command') {
    return null;
  }
  const found = capabilityFound(choices.devices, action.deviceId, action.capability);
  if ('problem' in found) {
    return found.problem;
  }
  try {
    validateCommand(found.device, action);
    return null;
  } catch (error) {
    return rawErrorText(error);
  }
}

function numbered(problems: readonly (string | null)[]): string[] {
  return problems.flatMap((problem, index) =>
    problem === null ? [] : [`${String(index + 1)}. ${problem}`],
  );
}

function referenceProblems(
  choices: ValidationChoices,
  definition: AutomationDefinition,
): Omit<Problems, 'name'> {
  return {
    when: numbered(definition.triggers.map((trigger) => triggerProblem(choices.devices, trigger))),
    only: numbered(
      definition.conditions.items.map((condition) => conditionProblem(choices.devices, condition)),
    ),
    then: numbered(definition.actions.map((action) => actionProblem(choices, action))),
  };
}

function nameProblems(name: string): string[] {
  if (name === '') {
    return [EMPTY.name];
  }
  return name.length > NAME_LIMIT ? [`Use at most ${String(NAME_LIMIT)} characters.`] : [];
}

function schemaProblems(issues: readonly Issue[]): Omit<Problems, 'name'> {
  const grouped: Record<Exclude<Block, 'name'>, string[]> = { when: [], only: [], then: [] };
  for (const issue of issues) {
    const block = blockOf(issue);
    if (block !== 'name') {
      grouped[block].push(issueText(issue));
    }
  }
  return grouped;
}

function hasProblems(problems: Problems): boolean {
  return Object.values(problems).some((list) => list.length > 0);
}

export function validateDraft(draft: Draft, choices: ValidationChoices): Validation {
  const name = draft.name.trim();
  const parsed = AUTOMATION_DEFINITION.safeParse(definitionOf(draft));
  const blocks = parsed.success
    ? referenceProblems(choices, parsed.data)
    : schemaProblems(parsed.error.issues);
  const problems: Problems = { name: nameProblems(name), ...blocks };
  if (!parsed.success || hasProblems(problems)) {
    return { valid: false, problems };
  }
  return { valid: true, name, definition: parsed.data };
}
