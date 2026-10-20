import type { AutomationValueContent } from '@smarteverything/domain';
import { EDITOR_FIELDS, type EditorField } from './focus-targets';

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
