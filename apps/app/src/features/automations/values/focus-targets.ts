export const EDITOR_FIELDS = {
  name: { title: 'Name', keywords: ['rename', 'title'] },
  value: { title: 'Current value', keywords: ['set', 'toggle', 'add', 'subtract'] },
  bounds: {
    title: 'Bounds and overflow',
    keywords: ['minimum', 'maximum', 'step', 'clamp', 'wrap'],
  },
  choices: { title: 'Choices', keywords: ['options', 'order', 'next', 'previous', 'cycle'] },
} as const;
export type EditorField = keyof typeof EDITOR_FIELDS;
