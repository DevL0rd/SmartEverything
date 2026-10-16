import { useState, type ReactNode } from 'react';
import {
  AI_REFERENCES_MAX,
  ASSISTANT_TEXT_MAX,
  type AiChatRow,
  type AiMessageReference,
} from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { draftRevision, setReferenceDraft } from '../data/drafts';
import { selectionKey } from '../commands/selection';
import { ReferencePanel } from './panel';
import { referenceKey } from './presentation';
import {
  referenceIntent,
  selectedReference,
  removedReference,
  type ComposerSelection,
} from './intent';
import { useReferenceSearch } from './search';
export interface ReferenceComposer {
  readonly opened: boolean;
  readonly dismiss: () => void;
  readonly panel: ReactNode;
  readonly editorPanel: ReactNode;
  readonly selection: ComposerSelection;
  readonly select: (selection: ComposerSelection) => void;
  readonly handleKey: (key: string) => boolean;
  readonly remove: (item: AiMessageReference) => void;
}
interface ComposerInput {
  readonly chat: AiChatRow | undefined;
  readonly key: string;
  readonly text: string;
  readonly references: readonly AiMessageReference[];
  readonly focus: () => void;
}
export function useReferenceComposer(input: ComposerInput): ReferenceComposer {
  const { chat, key, text, references, focus } = input;
  const [caret, setCaret] = useState({ key, start: text.length, end: text.length });
  const selection = caret.key === key ? caret : { start: text.length, end: text.length };
  const [dismissed, setDismissed] = useState<string | null>(null);
  const candidate = referenceIntent(text, selection);
  const revision = JSON.stringify([key, draftRevision(key), selection]);
  const intent =
    dismissed === revision || references.some((item) => overlapsReference(candidate, item))
      ? null
      : candidate;
  const opened = intent !== null;
  const search = useReferenceSearch(chat, intent);
  const [choice, setChoice] = useState<{ readonly key: string; readonly id: string } | null>(null);
  const selected = search.items.find(
    (item) => choice?.key === search.key && referenceKey(item.reference) === choice.id,
  );
  const selectedId =
    selected === undefined ? referenceKeyOrNull(search.items[0]) : referenceKey(selected.reference);
  const dismiss = (): void => {
    setDismissed(revision);
  };
  const choose = (id: string): void => {
    chooseReference(input, { search, intent, id, setCaret });
  };
  const keys = {
    names: search.items.map((item) => referenceKey(item.reference)),
    selected: selectedId,
    select: (id: string): void => {
      setChoice({ key: search.key, id });
    },
    choose,
    dismiss,
  };
  return {
    opened,
    dismiss,
    selection,
    select: (next): void => {
      setCaret({ key, ...next });
    },
    handleKey: referenceKeys(opened, keys),
    ...referencePanels(opened, { search, selected: selectedId, choose }),
    remove: (item): void => {
      setReferenceDraft(key, removedReference({ text, references }, item));
      focus();
    },
  };
}
function referenceKeyOrNull(
  item: ReturnType<typeof useReferenceSearch>['items'][number] | undefined,
): string | null {
  return item === undefined ? null : referenceKey(item.reference);
}

function chooseReference(
  input: ComposerInput,
  choice: {
    readonly search: ReturnType<typeof useReferenceSearch>;
    readonly intent: ReturnType<typeof referenceIntent>;
    readonly id: string;
    readonly setCaret: (caret: ComposerSelection & { readonly key: string }) => void;
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
  const next = selectedReference(input, choice.intent, item);
  if (next.text.length > ASSISTANT_TEXT_MAX) {
    notify({ message: 'Shorten the message before adding this reference.', tone: 'critical' });
    return;
  }
  setReferenceDraft(input.key, next);
  choice.setCaret({ key: input.key, ...next.selection });
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

function referenceKeys(
  opened: boolean,
  keys: Parameters<typeof selectionKey>[1],
): (key: string) => boolean {
  return (key): boolean => opened && selectionKey(key, keys);
}

function overlapsReference(
  intent: ReturnType<typeof referenceIntent>,
  item: AiMessageReference,
): boolean {
  return intent !== null && item.start < intent.end && item.end > intent.start;
}
