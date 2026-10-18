import type { ReactNode } from 'react';
import { KeyboardList, type ListEntry } from '../../../components/keyboard-list';

export interface Suggestions {
  readonly label: string;
  readonly open: boolean;
  readonly items: readonly ListEntry[];
  readonly highlighted: string | null;
  readonly highlight: (id: string) => void;
  readonly activate: (id: string) => void;
  readonly dismiss: () => void;
}

export const NO_SUGGESTIONS: Suggestions = {
  label: 'Suggestions',
  open: false,
  items: [],
  highlighted: null,
  highlight: (): void => undefined,
  activate: (): void => undefined,
  dismiss: (): void => undefined,
};

const OWNED_KEYS: ReadonlySet<string> = new Set(['Enter', 'ArrowUp', 'ArrowDown']);

export function suggestionKey(key: string, suggestions: Suggestions): boolean {
  if (suggestions.items.length === 0) return false;
  if (OWNED_KEYS.has(key)) return true;
  if (key !== 'Tab' || suggestions.highlighted === null) return false;
  suggestions.activate(suggestions.highlighted);
  return true;
}

export function SuggestionKeys({
  suggestions,
  className,
  children,
}: {
  readonly suggestions: Suggestions;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <KeyboardList
      items={suggestions.items}
      label={suggestions.label}
      autoHighlight
      combobox
      {...(className === undefined ? {} : { className })}
      onActivate={suggestions.activate}
      onHighlight={suggestions.highlight}
      {...(suggestions.open ? { onEscape: suggestions.dismiss } : {})}
    >
      {children}
    </KeyboardList>
  );
}
