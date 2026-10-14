import type { CommandDescriptor } from './types';
import { draftRevision } from '../data/drafts';
import { useState, type ReactNode } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import type { Quote } from '../model/composer-state';
import type { Upload } from '../data/uploads';
import { useCommands } from './catalogue';
import { commandIntent, insertCommand } from './intent';
import { commandDefinition } from './definition';
import { useCommandSubmission } from './submission';
import { selectionKey } from './selection';
import { CommandHint, CommandResult, CommandSuggestions } from './panels';
export interface CommandComposer {
  readonly opened: boolean;
  readonly dismiss: () => void;
  readonly panel: ReactNode;
  readonly hint: ReactNode;
  readonly result: ReactNode;
  readonly handleKey: (key: string) => boolean;
  readonly submit: (quote: Quote | null, uploads: readonly Upload[]) => Promise<boolean>;
}
export function useCommandComposer(
  chat: AiChatRow | undefined,
  draftKey: string,
  text: string,
  setText: (text: string) => void,
): CommandComposer {
  const intent = commandIntent(text);
  const prefix = intent.kind === 'text' ? null : intent.prefix;
  const revision = draftRevision(draftKey);
  const [dismissed, setDismissed] = useState<{
    readonly prefix: string | null;
    readonly revision: number;
  } | null>(null);
  const opened =
    prefix !== null && !dismissedIntent(dismissed, prefix, revision) && !/\s/u.test(text);
  const catalogue = useCommands(chat, prefix !== null);
  const choice = useDefinitionChoice(catalogue, prefix, text, setText);
  const submission = useCommandSubmission(catalogue, draftKey, text, { definitionId: choice.id });
  const filtered = matchingCommands(catalogue.commands, prefix);
  const selected = selectedCommand(filtered, choice.selection);
  const dismiss = (): void => {
    setDismissed({ prefix, revision });
  };
  const choose = (id: string): void => {
    const name = choice.choose(id);
    if (name !== null) setDismissed({ prefix: name, revision: draftRevision(draftKey) });
  };
  const chosen = commandDefinition(catalogue.commands, prefix ?? '', choice.id);
  const keys = {
    names: filtered.map((row) => row.id),
    selected,
    select: choice.select,
    choose,
    dismiss,
  };
  return {
    opened,
    dismiss,
    submit: (quote, uploads): Promise<boolean> => {
      dismiss();
      return submission.submit(quote, uploads);
    },
    handleKey: (key): boolean => opened && selectionKey(key, keys),
    ...commandPanels({ opened, chosen, filtered, selected, choose, catalogue, submission }),
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
}
function commandPanels({
  opened,
  chosen,
  filtered,
  selected,
  choose,
  catalogue,
  submission,
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
      />
    ) : null,
    result:
      submission.receipt?.key === catalogue.key ? (
        <CommandResult receipt={submission.receipt.value} dismiss={submission.dismissReceipt} />
      ) : null,
  };
}

function dismissedIntent(
  dismissed: { readonly prefix: string | null; readonly revision: number } | null,
  prefix: string,
  revision: number,
): boolean {
  return dismissed?.prefix === prefix && dismissed.revision === revision;
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
  text: string,
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
      setText(insertCommand(text, command.name));
      setChoice({ key: catalogue.key, id, name: command.name });
      return command.name;
    },
  };
}
