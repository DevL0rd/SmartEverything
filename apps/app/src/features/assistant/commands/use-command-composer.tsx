import type { CommandDescriptor } from './types';
import { aiDrafts } from '../data/ai-drafts';
import { draftRevision, draftText, useDraftSelected } from '../data/drafts';
import { useDerived } from '../data/use-derived';
import { sameJson } from '../../../store/same-json';
import { useState, type ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import type { Quote } from '../model/composer-state';
import type { Upload } from '../data/uploads';
import { useCommands } from './catalogue';
import { commandIntent, insertCommand } from './intent';
import { commandDefinition } from './definition';
import { useCommandSubmission } from './submission';
import { NO_SUGGESTIONS, type Suggestions } from '../components/suggestion-keys';
import { CommandHint, CommandResult, CommandSuggestions, type QuoteConflict } from './panels';
export interface CommandComposer {
  readonly opened: boolean;
  readonly dismiss: () => void;
  readonly panel: ReactNode;
  readonly hint: ReactNode;
  readonly result: ReactNode;
  readonly suggestions: Suggestions;
  readonly submit: (quote: Quote | null, uploads: readonly Upload[]) => Promise<boolean>;
}
export interface CommandComposerInput {
  readonly chat: AiChatRow | undefined;
  readonly draftKey: string;
  readonly setText: (text: string) => void;
  readonly quote: QuoteConflict | null;
}

interface CommandKey {
  readonly prefix: string | null;
  readonly spaced: boolean;
}

function commandKeyOf(text: string): CommandKey {
  const intent = commandIntent(text);
  return { prefix: intent.kind === 'text' ? null : intent.prefix, spaced: /\s/u.test(text) };
}

export function useCommandComposer(input: CommandComposerInput): CommandComposer {
  const { chat, draftKey, setText, quote } = input;
  const { prefix, spaced } = useDraftSelected(draftKey, commandKeyOf, sameJson);
  const [dismissed, setDismissed] = useState<{
    readonly prefix: string | null;
    readonly revision: number;
  } | null>(null);
  const stale = useDerived(
    aiDrafts.subscribe,
    () => dismissed !== null && dismissed.revision !== draftRevision(draftKey),
    Object.is,
  );
  const opened = prefix !== null && !(dismissed?.prefix === prefix && !stale) && !spaced;
  const catalogue = useCommands(chat, prefix !== null);
  const choice = useDefinitionChoice(catalogue, prefix, draftKey, setText);
  const submission = useCommandSubmission(catalogue, draftKey, () => draftText(draftKey), {
    definitionId: choice.id,
  });
  const filtered = matchingCommands(catalogue.commands, prefix);
  const selected = selectedCommand(filtered, choice.selection);
  const dismiss = (): void => {
    setDismissed({ prefix, revision: draftRevision(draftKey) });
  };
  const choose = (id: string): void => {
    const name = choice.choose(id);
    if (name !== null) setDismissed({ prefix: name, revision: draftRevision(draftKey) });
  };
  const chosen = commandDefinition(catalogue.commands, prefix ?? '', choice.id);
  const listed = catalogue.reason === null && quote === null ? filtered : [];
  return {
    opened,
    dismiss,
    submit: (drafted, uploads): Promise<boolean> => {
      dismiss();
      return submission.submit(drafted, uploads);
    },
    suggestions: opened
      ? commandSuggestions(listed, selected, { highlight: choice.select, choose, dismiss })
      : NO_SUGGESTIONS,
    ...commandPanels({ opened, chosen, filtered, selected, choose, catalogue, submission, quote }),
  };
}

function commandSuggestions(
  listed: readonly CommandDescriptor[],
  selected: string | null,
  actions: {
    readonly highlight: (id: string) => void;
    readonly choose: (id: string) => void;
    readonly dismiss: () => void;
  },
): Suggestions {
  return {
    label: 'Commands',
    open: true,
    items: listed.map((row) => ({ id: row.id })),
    highlighted: selected,
    highlight: actions.highlight,
    activate: actions.choose,
    dismiss: actions.dismiss,
  };
}

function selectedCommand(
  commands: readonly CommandDescriptor[],
  selection: string | null,
): string | null {
  return commands.find((command) => command.id === selection)?.id ?? commands[0]?.id ?? null;
}
interface PanelInput {
  readonly opened: boolean;
  readonly chosen: CommandDescriptor | undefined;
  readonly filtered: readonly CommandDescriptor[];
  readonly selected: string | null;
  readonly choose: (name: string) => void;
  readonly catalogue: ReturnType<typeof useCommands>;
  readonly submission: ReturnType<typeof useCommandSubmission>;
  readonly quote: QuoteConflict | null;
}
function commandPanels({
  opened,
  chosen,
  filtered,
  selected,
  choose,
  catalogue,
  submission,
  quote,
}: PanelInput): Pick<CommandComposer, 'hint' | 'panel' | 'result'> {
  return {
    hint: !opened && chosen !== undefined ? <CommandHint command={chosen} /> : null,
    panel: opened ? (
      <CommandSuggestions
        commands={filtered}
        selected={selected}
        choose={choose}
        reason={catalogue.reason}
        retry={catalogue.error ? catalogue.retry : null}
        quote={quote}
      />
    ) : null,
    result:
      submission.receipt?.key === catalogue.key ? (
        <CommandResult receipt={submission.receipt.value} dismiss={submission.dismissReceipt} />
      ) : null,
  };
}

function matchingCommands(
  commands: readonly CommandDescriptor[],
  prefix: string | null,
): readonly CommandDescriptor[] {
  if (prefix === null) return [];
  return commands.filter(
    (command) =>
      command.name.startsWith(prefix) || command.aliases.some((alias) => alias.startsWith(prefix)),
  );
}

function useDefinitionChoice(
  catalogue: ReturnType<typeof useCommands>,
  prefix: string | null,
  draftKey: string,
  setText: (text: string) => void,
): {
  readonly id: string | null;
  readonly selection: string | null;
  readonly select: (id: string) => void;
  readonly choose: (id: string) => string | null;
} {
  const [selection, select] = useState<string | null>(null);
  const [choice, setChoice] = useState<{
    readonly key: string;
    readonly id: string;
    readonly name: string;
  } | null>(null);
  const current = choice?.key === catalogue.key && choice.name === prefix ? choice : null;
  if (choice !== null && current === null) setChoice(null);
  return {
    id: current?.id ?? null,
    selection,
    select,
    choose: (id): string | null => {
      const matches = catalogue.commands.filter((command) => command.id === id);
      const command = matches.length === 1 ? matches[0] : undefined;
      if (command === undefined) return null;
      setText(insertCommand(draftText(draftKey), command.name));
      setChoice({ key: catalogue.key, id, name: command.name });
      return command.name;
    },
  };
}
