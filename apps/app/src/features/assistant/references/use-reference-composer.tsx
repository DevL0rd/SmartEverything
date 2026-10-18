import { useCallback, useState, type ReactNode } from 'react';
import {
  AI_REFERENCES_MAX,
  type AiChatRow,
  type AiMessageReference,
} from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { aiDrafts } from '../data/ai-drafts';
import { draftRevision, draftText, setReferenceDraft } from '../data/drafts';
import { useDerived } from '../data/use-derived';
import { ValueStore } from '../../../design/external-store';
import { sameJson } from '../../../store/same-json';
import { NO_SUGGESTIONS, type Suggestions } from '../components/suggestion-keys';
import { ReferencePanel } from './panel';
import { referenceKey } from './presentation';
import {
  referenceIntent,
  selectedReference,
  type ReferenceIntent,
  removedReference,
  type ComposerSelection,
} from './intent';
import { useReferenceSearch } from './search';
export interface ReferenceComposer {
  readonly opened: boolean;
  readonly dismiss: () => void;
  readonly panel: ReactNode;
  readonly editorPanel: ReactNode;
  readonly selection: ComposerSelection | undefined;
  readonly select: (selection: ComposerSelection) => void;
  readonly suggestions: Suggestions;
  readonly remove: (item: AiMessageReference) => void;
}
interface ComposerInput {
  readonly chat: AiChatRow | undefined;
  readonly key: string;
  readonly references: readonly AiMessageReference[];
  readonly focus: () => void;
}
interface Caret extends ComposerSelection {
  readonly key: string;
}
type CaretStore = ValueStore<Caret | null>;

function endOf(key: string): ComposerSelection {
  const end = draftText(key).length;
  return { start: end, end };
}

function selectionOf(key: string, caret: CaretStore): ComposerSelection {
  const current = caret.get();
  return current?.key === key ? { start: current.start, end: current.end } : endOf(key);
}

const revisionOf = (key: string, selection: ComposerSelection): string =>
  JSON.stringify([key, draftRevision(key), selection]);

function useReferenceIntent(
  key: string,
  caret: CaretStore,
  filter: {
    readonly references: readonly AiMessageReference[];
    readonly dismissed: string | null;
  },
): ReferenceIntent | null {
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      const draft = aiDrafts.subscribe(listener);
      const moved = caret.subscribe(listener);
      return (): void => {
        draft();
        moved();
      };
    },
    [caret],
  );
  return useDerived(
    subscribe,
    () => {
      const selection = selectionOf(key, caret);
      const candidate = referenceIntent(draftText(key), selection);
      if (candidate === null || filter.dismissed === revisionOf(key, selection)) return null;
      return filter.references.some((item) => overlapsReference(candidate, item))
        ? null
        : candidate;
    },
    sameJson,
  );
}

interface Forced {
  readonly key: string;
  readonly selection: ComposerSelection | undefined;
}

interface CaretControl {
  readonly store: CaretStore;
  readonly selection: ComposerSelection | undefined;
  readonly move: (selection: ComposerSelection) => void;
  readonly observe: (selection: ComposerSelection) => void;
}

function useCaretControl(key: string): CaretControl {
  const [store] = useState<CaretStore>(() => new ValueStore<Caret | null>(null));
  const [forced, setForced] = useState<Forced>(() => ({ key, selection: endOf(key) }));
  if (forced.key !== key) setForced({ key, selection: endOf(key) });
  return {
    store,
    selection: forced.key === key ? forced.selection : undefined,
    move: (selection): void => {
      store.set({ key, ...selection });
      setForced({ key, selection });
    },
    observe: (next): void => {
      const current = store.get();
      if (current?.key !== key || current.start !== next.start || current.end !== next.end)
        store.set({ key, ...next });
      if (forced.selection !== undefined) setForced({ key, selection: undefined });
    },
  };
}

export function useReferenceComposer(input: ComposerInput): ReferenceComposer {
  const { chat, key, references, focus } = input;
  const caret = useCaretControl(key);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const intent = useReferenceIntent(key, caret.store, { references, dismissed });
  const opened = intent !== null;
  const search = useReferenceSearch(chat, intent);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const dismiss = (): void => {
    setDismissed(revisionOf(key, selectionOf(key, caret.store)));
  };
  const choose = (id: string): void => {
    chooseReference(input, { search, intent, id, moveTo: caret.move });
  };
  return {
    opened,
    dismiss,
    selection: caret.selection,
    select: caret.observe,
    suggestions: opened
      ? {
          label: 'References',
          open: true,
          items: search.items.map((item) => ({ id: referenceKey(item.reference) })),
          highlighted,
          highlight: setHighlighted,
          activate: choose,
          dismiss,
        }
      : NO_SUGGESTIONS,
    ...referencePanels(opened, { search, choose }),
    remove: (item): void => {
      setReferenceDraft(key, removedReference({ text: draftText(key), references }, item));
      focus();
    },
  };
}
function chooseReference(
  input: ComposerInput,
  choice: {
    readonly search: ReturnType<typeof useReferenceSearch>;
    readonly intent: ReturnType<typeof referenceIntent>;
    readonly id: string;
    readonly moveTo: (selection: ComposerSelection) => void;
  },
): void {
  const item = choice.search.items.find((entry) => referenceKey(entry.reference) === choice.id);
  if (item === undefined || choice.intent === null || !choice.search.valid()) return;
  if (input.references.length >= AI_REFERENCES_MAX) {
    notify({
      message: `A message can reference up to ${String(AI_REFERENCES_MAX)} items. Remove one to continue.`,
      tone: 'critical',
    });
    return;
  }
  const next = selectedReference(
    { text: draftText(input.key), references: input.references },
    choice.intent,
    item,
  );
  setReferenceDraft(input.key, next);
  choice.moveTo(next.selection);
  input.focus();
}

function referencePanels(
  opened: boolean,
  props: Parameters<typeof ReferencePanel>[0],
): Pick<ReferenceComposer, 'panel' | 'editorPanel'> {
  return {
    panel: opened ? <ReferencePanel {...props} /> : null,
    editorPanel: opened ? <ReferencePanel {...props} inline /> : null,
  };
}

function overlapsReference(
  intent: ReturnType<typeof referenceIntent>,
  item: AiMessageReference,
): boolean {
  return intent !== null && item.start < intent.end && item.end > intent.start;
}
