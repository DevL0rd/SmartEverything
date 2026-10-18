import {
  stepChildren,
  type AutomationRow,
  type AutomationV2,
  type AutomationValueContent,
  type StepV2,
} from '@smarteverything/domain';
import { describeCondition, type Names } from './describe';
import { describeStep } from './describe-steps';
import {
  AUTOMATION_EDITOR_FIELDS,
  EDITOR_FIELDS,
  REUSABLE_EDITOR_FIELDS,
  type EditorField,
} from './focus-targets';
import { STEP_LABELS } from './kind-labels';
import { isReusable, storedAutomationOf } from './reusable-steps';
import { rootGroup } from './conditions';

export interface AutomationFocusTarget {
  readonly key: string;
  readonly parent: string | null;
  readonly title: string;
  readonly focus: string;
  readonly keywords: readonly string[];
}

function fields(keys: readonly EditorField[]): readonly AutomationFocusTarget[] {
  return keys.map((key) => ({
    key,
    parent: null,
    title: EDITOR_FIELDS[key].title,
    focus: key,
    keywords: EDITOR_FIELDS[key].keywords,
  }));
}

function stepTargets(
  steps: readonly StepV2[],
  names: Names,
  parent = 'steps',
): readonly AutomationFocusTarget[] {
  return steps.flatMap((step, index) => {
    const key = step.id === undefined ? `${parent}:${String(index)}` : `node:${step.id}`;
    const entry = {
      key,
      parent,
      title: `${STEP_LABELS[step.do]} · ${describeStep(names, step)}`,
      focus: step.id === undefined ? 'steps' : key,
      keywords: ['step', 'action', step.do],
    };
    return [entry, ...stepTargets(stepChildren(step), names, key)];
  });
}

function conditionTargets(
  automation: AutomationV2,
  names: Names,
): readonly AutomationFocusTarget[] {
  return rootGroup(automation.onlyIf).items.map((condition, index) => ({
    key: `condition:${String(index)}`,
    parent: 'conditions',
    title: describeCondition(names, condition),
    focus: `condition:${String(index)}`,
    keywords: ['condition', 'compare'],
  }));
}

interface StoredFocusTargets {
  readonly reusable: boolean;
  readonly targets: readonly AutomationFocusTarget[];
}

export function storedFocusTargets(row: AutomationRow, names: Names): StoredFocusTargets | null {
  const automation = storedAutomationOf(row);
  if (automation === null) return null;
  if (isReusable(automation))
    return {
      reusable: true,
      targets: [
        ...fields(REUSABLE_EDITOR_FIELDS),
        ...(automation.inputs ?? []).map((input) => ({
          key: `input:${input.name}`,
          parent: 'inputs',
          title: input.name,
          focus: `input:${input.name}`,
          keywords: ['input', 'argument', input.type],
        })),
        ...stepTargets(automation.steps, names),
      ],
    };
  return {
    reusable: false,
    targets: [
      ...fields(AUTOMATION_EDITOR_FIELDS),
      ...conditionTargets(automation, names),
      ...stepTargets(automation.steps, names),
    ],
  };
}

export function valueFocusTargets(
  content: AutomationValueContent,
): readonly AutomationFocusTarget[] {
  if (content.kind === 'choice')
    return [
      ...fields(['name', 'value', 'choices']),
      ...content.choices.map((choice) => ({
        key: `choice:${choice.id}`,
        parent: 'choices',
        title: choice.label,
        focus: `choice:${choice.id}`,
        keywords: ['choice', 'option', 'rename'],
      })),
    ];
  return fields(content.kind === 'boolean' ? ['name', 'value'] : ['name', 'value', 'bounds']);
}
