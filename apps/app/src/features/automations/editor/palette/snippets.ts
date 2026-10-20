import { snippetsFor, type Snippet } from '../../model/templates/snippets';
import type { TemplateDevice } from '../../model/templates/parameters';
import type { PaletteEntry } from './palette-categories';

const SNIPPET_ICON = 'puzzle';

export function snippetEntry(snippet: Snippet): PaletteEntry {
  return {
    key: snippet.id,
    choice: { source: 'snippet', snippetId: snippet.id },
    name: snippet.title,
    meaning: snippet.why,
    takes: snippet.slots.length === 0 ? 'Takes nothing' : 'Asks which devices to use',
    icon: SNIPPET_ICON,
    section: 'snippets',
    keywords: ['snippet', 'template', 'fragment'],
    typeWords: [],
    gives: [],
    kindId: null,
    usageId: null,
    trigger: false,
    disabled: null,
  };
}

export function snippetEntries(devices: readonly TemplateDevice[]): readonly PaletteEntry[] {
  return snippetsFor(devices).map(snippetEntry);
}
