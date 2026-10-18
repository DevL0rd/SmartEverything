export const EDITOR_FIELDS = {
  name: { title: 'Name', keywords: ['rename', 'title'] },
  when: { title: 'When', keywords: ['trigger', 'time', 'event', 'signal', 'speech'] },
  conditions: { title: 'Only if', keywords: ['conditions', 'all', 'any', 'compare'] },
  steps: { title: 'Steps', keywords: ['actions', 'if', 'repeat', 'wait', 'stop', 'control'] },
  advanced: {
    title: 'Advanced',
    keywords: ['single', 'restart', 'queue', 'parallel', 'run behaviour', 'again', 'key'],
  },
  inputs: { title: 'Inputs', keywords: ['arguments', 'type', 'parameters'] },
  value: { title: 'Current value', keywords: ['set', 'toggle', 'add', 'subtract'] },
  bounds: {
    title: 'Bounds and overflow',
    keywords: ['minimum', 'maximum', 'step', 'clamp', 'wrap'],
  },
  choices: { title: 'Choices', keywords: ['options', 'order', 'next', 'previous', 'cycle'] },
} as const;
export type EditorField = keyof typeof EDITOR_FIELDS;

export const AUTOMATION_EDITOR_FIELDS = [
  'name',
  'when',
  'conditions',
  'steps',
  'advanced',
] as const;
export const REUSABLE_EDITOR_FIELDS = ['name', 'inputs', 'steps', 'advanced'] as const;

export function automationEditorField(
  value: EditorField | null,
): value is (typeof AUTOMATION_EDITOR_FIELDS)[number] {
  return AUTOMATION_EDITOR_FIELDS.some((field) => field === value);
}

export function reusableEditorField(
  value: EditorField | null,
): value is (typeof REUSABLE_EDITOR_FIELDS)[number] {
  return REUSABLE_EDITOR_FIELDS.some((field) => field === value);
}
