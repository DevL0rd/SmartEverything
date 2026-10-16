export const EDITOR_FIELDS = {
  name: { title: 'Name', keywords: ['rename', 'title'] },
  when: { title: 'When', keywords: ['trigger', 'time', 'event', 'signal'] },
  conditions: { title: 'Only if', keywords: ['conditions', 'all', 'any', 'compare'] },
  steps: { title: 'Steps', keywords: ['actions', 'choose', 'repeat', 'wait', 'stop'] },
  policy: { title: 'Run behavior', keywords: ['single', 'restart', 'queue', 'parallel', 'policy'] },
  controlKey: { title: 'Control key', keywords: ['stop', 'key', 'matching'] },
  parameters: { title: 'Parameters', keywords: ['inputs', 'arguments', 'type'] },
  value: { title: 'Current value', keywords: ['set', 'toggle', 'add', 'subtract'] },
  bounds: {
    title: 'Bounds and overflow',
    keywords: ['minimum', 'maximum', 'quantum', 'clamp', 'wrap'],
  },
  choices: { title: 'Choices', keywords: ['options', 'order', 'next', 'previous', 'cycle'] },
} as const;
export type EditorField = keyof typeof EDITOR_FIELDS;

export const AUTOMATION_EDITOR_FIELDS = [
  'name',
  'when',
  'conditions',
  'steps',
  'policy',
  'controlKey',
] as const;
export const SEQUENCE_EDITOR_FIELDS = [
  'name',
  'parameters',
  'steps',
  'policy',
  'controlKey',
] as const;
export function automationEditorField(
  value: EditorField | null,
): value is (typeof AUTOMATION_EDITOR_FIELDS)[number] {
  return AUTOMATION_EDITOR_FIELDS.some((field) => field === value);
}
export function sequenceEditorField(
  value: EditorField | null,
): value is (typeof SEQUENCE_EDITOR_FIELDS)[number] {
  return SEQUENCE_EDITOR_FIELDS.some((field) => field === value);
}
