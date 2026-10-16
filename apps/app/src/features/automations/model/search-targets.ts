import type {
  Action,
  AutomationDefinition,
  AutomationSequenceDefinition,
  AutomationValueContent,
  Conditions,
} from '@smarteverything/domain';
import {
  EDITOR_FIELDS,
  AUTOMATION_EDITOR_FIELDS,
  SEQUENCE_EDITOR_FIELDS,
  type EditorField,
} from './focus-targets';
import { describeAction, describeCondition, type Names } from './describe';
import { PROGRAM_LOOKS } from './program-actions';

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
function actionTargets(
  actions: readonly Action[],
  names: Names,
  parent = 'steps',
): readonly AutomationFocusTarget[] {
  return actions.flatMap((action, index) => {
    const key =
      action.nodeId === undefined ? `${parent}:legacy:${String(index)}` : `node:${action.nodeId}`;
    const entry = {
      key,
      parent,
      title: `${PROGRAM_LOOKS[action.type].label} · ${describeAction(names, action)}`,
      focus: action.nodeId === undefined ? 'steps' : key,
      keywords: ['step', 'action', action.type],
    };
    if (action.type === 'repeat') return [entry, ...actionTargets(action.actions, names, key)];
    if (action.type !== 'choose') return [entry];
    return [
      entry,
      ...action.branches.flatMap((branch) => actionTargets(branch.actions, names, key)),
      ...actionTargets(action.otherwise ?? [], names, key),
    ];
  });
}
function conditionTargets(conditions: Conditions, names: Names): readonly AutomationFocusTarget[] {
  return conditions.items.map((condition, index) => ({
    key: `condition:${String(index)}`,
    parent: 'conditions',
    title: describeCondition(names, condition),
    focus: `condition:${String(index)}`,
    keywords: ['condition', 'compare', condition.type],
  }));
}
export function automationFocusTargets(
  definition: AutomationDefinition,
  names: Names,
): readonly AutomationFocusTarget[] {
  return [
    ...fields(AUTOMATION_EDITOR_FIELDS),
    ...conditionTargets(definition.conditions, names),
    ...actionTargets(definition.actions, names),
  ];
}
export function sequenceFocusTargets(
  definition: AutomationSequenceDefinition,
  names: Names,
): readonly AutomationFocusTarget[] {
  return [
    ...fields(SEQUENCE_EDITOR_FIELDS),
    ...definition.parameters.map((parameter) => ({
      key: `parameter:${parameter.name}`,
      parent: 'parameters',
      title: parameter.name,
      focus: `parameter:${parameter.name}`,
      keywords: ['parameter', 'input', parameter.kind],
    })),
    ...actionTargets(definition.actions, names),
  ];
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
