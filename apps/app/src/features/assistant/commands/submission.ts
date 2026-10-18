import { Logger } from '@smarteverything/logging';
import type { AiChatRuntimeProvider } from '@smarteverything/domain';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import type { StoreState } from '../../../store/state';
import { useConnection, type ConnectionState } from '../../../api/transport';
import {
  captureAssistantWrite,
  type AssistantWriteScope,
} from '../../../store/assistant-response-style';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CommandDescriptor, CommandOutcome, CommandScope } from './types';
import type { Quote } from '../model/composer-state';
import { clearSubmittedUploads, type Upload } from '../data/uploads';
import { clearSubmittedDraft, draftRevision } from '../data/drafts';
import { commandIntent } from './intent';
import { commandDefinition } from './definition';
import { nativeRuntimeAdapter } from './native-registry';
import { nativeProviderContext } from './native-provider';
import { commandAttachments } from './attachments';
import { commandAdapter } from './adapters';
import type { CommandCatalogue } from './catalogue';
import type { CommandReceipt } from './panels';
const log = new Logger('app.assistant');
interface SubmissionInput {
  readonly catalogue: CommandCatalogue;
  readonly draftKey: string;
  readonly text: string;
  readonly quote: Quote | null;
  readonly uploads: readonly Upload[];
  readonly revision: number;
  readonly authority: AssistantWriteScope;
  readonly client: QueryClient;
  readonly signal: AbortSignal;
  readonly preserveDraft: boolean;
  readonly definitionId: string | null;
  readonly ownNativeJob: (jobId: string) => void;
}
interface ReceiptState {
  readonly key: string;
  readonly value: CommandReceipt;
}
interface Submission {
  readonly receipt: ReceiptState | null;
  readonly dismissReceipt: () => void;
  readonly submit: (quote: Quote | null, uploads: readonly Upload[]) => Promise<boolean>;
}
export function useCommandSubmission(
  catalogue: CommandCatalogue,
  draftKey: string,
  text: () => string,
  options: { readonly preserveDraft?: boolean; readonly definitionId?: string | null } = {},
): Submission {
  const store = useEntityStore();
  const client = useQueryClient();
  const signal = useBindingSignal(catalogue.key);
  const [receipt, setReceipt] = useCurrentReceipt(catalogue.key);
  const pending = useCommandPending();
  const current = useCurrentCommandBinding(catalogue.key);
  const submit = async (quote: Quote | null, uploads: readonly Upload[]): Promise<boolean> => {
    if (pending.current()) return false;
    const authority = captureAssistantWrite(store);
    const binding = current.current;
    const native = captureNativeJob(catalogue.scope, client);
    const input = {
      catalogue,
      client,
      signal,
      preserveDraft: options.preserveDraft === true,
      definitionId: options.definitionId ?? null,
      ownNativeJob: native.own,
      draftKey,
      text: text(),
      quote,
      uploads,
      revision: draftRevision(draftKey),
      authority: {
        client: authority.client,
        current: (): boolean =>
          authority.current() && current.current === binding && native.current(),
      },
    };
    const show = (value: CommandReceipt): void => {
      if (current.current === binding && authority.current())
        setReceipt({ key: catalogue.key, value });
    };
    return await pending.run(() => submitCommand(input, show));
  };
  return {
    receipt,
    submit,
    dismissReceipt: (): void => {
      setReceipt(null);
    },
  };
}
function logCommand(
  event: string,
  name: string,
  input: SubmissionInput,
  extra: Readonly<Record<string, unknown>> = {},
): void {
  log[event.endsWith('.skipped') ? 'warn' : 'info'](event, {
    name,
    chatId: input.catalogue.chatId,
    scopeKind: input.catalogue.scope?.kind ?? null,
    uploads: input.uploads.length,
    ...extra,
  });
}
interface LineTarget {
  readonly name: string;
  readonly command: CommandDescriptor;
  readonly chatId: string;
  readonly scope: CommandScope;
}
async function executeLine(
  input: SubmissionInput,
  target: LineTarget,
  show: (receipt: CommandReceipt) => void,
): Promise<CommandOutcome> {
  const { name, command, chatId, scope } = target;
  return await commandAdapter(scope.kind).execute({
    chatId,
    scopeKey: input.catalogue.key,
    scope,
    command,
    line: input.text,
    arguments: acceptedArguments(command, input.text),
    attachments: await commandAttachments(input.uploads),
    authority: input.authority,
    client: input.client,
    signal: input.signal,
    ownNativeJob: input.ownNativeJob,
    progress: (state, text): void => {
      show({ name, state, text });
    },
  });
}
function startReceipt(name: string, scope: CommandScope): CommandReceipt {
  const dsh = scope.kind === 'dsh';
  return {
    name,
    state: dsh ? 'running' : 'submitting',
    text: dsh ? 'Running on the selected machine…' : 'Sending to the selected machine…',
  };
}
async function submitCommand(
  input: SubmissionInput,
  show: (receipt: CommandReceipt) => void,
): Promise<boolean> {
  const intent = commandIntent(input.text);
  if (intent.kind === 'text') return false;
  const name = intent.kind === 'command' ? intent.name : '';
  const rejection = rejectCommand(input, name);
  if (rejection !== null) {
    logCommand('command.rejected', name, input, { reasonLength: rejection.length });
    show({ name, state: 'not run', text: rejection });
    return false;
  }
  const { scope, chatId } = input.catalogue;
  if (scope === null || chatId === null) {
    logCommand('command.skipped', name, input, { reason: 'no-scope-or-chat' });
    return false;
  }
  const startedAt = Date.now();
  logCommand('command.started', name, input);
  show(startReceipt(name, scope));
  try {
    const command = commandDefinition(input.catalogue.commands, name, input.definitionId);
    if (command === undefined) {
      logCommand('command.skipped', name, input, { reason: 'unknown-command' });
      return false;
    }
    const outcome = await executeLine(input, { name, command, chatId, scope }, show);
    logCommand('command.finished', name, input, {
      status: outcome.status,
      durationMs: Date.now() - startedAt,
    });
    show(receiptOf(name, outcome));
    return completeCommand(input, outcome);
  } catch (error) {
    log.error('command.submission_failed', error, {
      name,
      chatId,
      durationMs: Date.now() - startedAt,
    });
    show({ name, state: 'failed', text: 'The command failed.' });
    return false;
  }
}
function completeCommand(input: SubmissionInput, outcome: CommandOutcome): boolean {
  if (!input.authority.current() || input.signal.aborted) return false;
  if (outcome.status !== 'settled' || !['complete', 'compacted'].includes(outcome.completion))
    return false;
  if (input.preserveDraft) return true;
  clearSubmittedDraft(input.draftKey, input.revision, input.quote);
  clearSubmittedUploads(input.uploads.map((upload) => upload.key));
  return true;
}
function rejectCommand(input: SubmissionInput, name: string): string | null {
  if (name === '') return 'Choose a command from the list before running it.';
  if (input.quote !== null)
    return 'Remove the reply quote to run a command. Your quote and draft stay here.';
  if (input.catalogue.reason !== null) return input.catalogue.reason;
  const definitionId = input.catalogue.scope?.kind === 'native' ? input.definitionId : null;
  if (
    input.catalogue.commands.filter((row) =>
      definitionId === null
        ? row.name === name || row.aliases.includes(name)
        : row.id === definitionId,
    ).length > 1
  )
    return `/${name} matches more than one command. Choose one from the command list.`;
  return commandRejection(
    commandDefinition(input.catalogue.commands, name, input.definitionId),
    name,
    input.uploads,
    commandArguments(input.text),
  );
}
function commandRejection(
  command: CommandDescriptor | undefined,
  name: string,
  uploads: readonly Upload[],
  argumentsText: string,
): string | null {
  if (command === undefined)
    return `/${name} is not available in this chat. Type / to see this machine’s commands. Quote a bare path such as "/${name}" to send it as text.`;
  if (!command.enabled || command.unavailableReason !== null)
    return command.unavailableReason ?? `/${name} is turned off on the selected machine.`;
  if (!command.arguments && argumentsText.trim().length > 0)
    return `/${name} does not accept arguments. Remove them to run the command.`;
  return uploads.length > 0 && command.input?.attachments !== true
    ? `/${name} does not accept attachments. Remove them to run the command.`
    : null;
}
function receiptOf(name: string, outcome: CommandOutcome): CommandReceipt {
  if (outcome.status !== 'settled')
    return {
      name,
      state: 'failed',
      text: 'The command failed.',
    };
  return {
    name,
    state: outcome.completion,
    text: outcome.text,
  };
}

interface ReceiptBinding {
  readonly key: string;
  readonly session: StoreState['session'];
  readonly connection: ConnectionState;
}
function useCurrentReceipt(
  key: string,
): readonly [ReceiptState | null, (value: ReceiptState | null) => void] {
  const session = useStoreSelector((state) => state.session);
  const connection = useConnection();
  const binding = { key, session, connection };
  const [state, setState] = useState<{
    readonly binding: ReceiptBinding;
    readonly receipt: ReceiptState | null;
  }>({ binding, receipt: null });
  if (!sameReceiptBinding(state.binding, binding))
    setState({ binding, receipt: retireReceipt(state.receipt) });
  return [
    state.receipt,
    (receipt): void => {
      setState({ binding, receipt });
    },
  ];
}
function sameReceiptBinding(first: ReceiptBinding, second: ReceiptBinding): boolean {
  return (
    first.key === second.key &&
    first.session === second.session &&
    first.connection === second.connection
  );
}
function retireReceipt(receipt: ReceiptState | null): ReceiptState | null {
  if (receipt === null || !['running', 'admitted', 'submitting'].includes(receipt.value.state))
    return receipt;
  return {
    ...receipt,
    value: {
      ...receipt.value,
      state: 'failed',
      text: 'The command failed.',
    },
  };
}

function commandArguments(line: string): string {
  return line.replace(/^\/\S+(?:[ \t])?/u, '');
}
function useBindingSignal(key: string): AbortSignal {
  const session = useStoreSelector((state) => state.session);
  const connection = useConnection();
  const controller = useMemo(
    () => ({ key, session, connection, abort: new AbortController() }),
    [key, session, connection],
  );
  useLayoutEffect(
    () => (): void => {
      controller.abort.abort();
    },
    [controller],
  );
  return controller.abort.signal;
}

function useCurrentCommandBinding(
  key: string,
): ReturnType<typeof useRef<{ readonly key: string; readonly revision: number }>> {
  const current = useRef({ key, revision: 0 });
  useLayoutEffect(() => {
    if (current.current.key !== key)
      current.current = { key, revision: current.current.revision + 1 };
  }, [key]);
  return current;
}

function captureNativeJob(
  scope: CommandScope | null,
  client: QueryClient,
): { readonly own: (jobId: string) => void; readonly current: () => boolean } {
  let owned: string | null = null;
  return {
    own: (jobId): void => {
      owned = jobId;
    },
    current: (): boolean =>
      scope?.kind !== 'native' || currentNativeJob(client, scope.value, owned),
  };
}
function currentNativeJob(
  client: QueryClient,
  scope: Extract<CommandScope, { readonly kind: 'native' }>['value'],
  owned: string | null,
): boolean {
  const state = client.getQueryData<AiChatRuntimeProvider>(
    nativeRuntimeAdapter(scope.runtime).key(scope.chat_id),
  );
  if (state === undefined) return false;
  const context = nativeProviderContext(state);
  if (context === null || state.state === 'unknown') return false;
  const expected = [
    scope.runtime,
    scope.device_id,
    scope.device_id,
    scope.session_id,
    scope.session_id,
    scope.process_generation,
    scope.cwd,
  ];
  const actual = [
    context.runtime,
    state.device_id,
    context.device_id,
    state.session_id,
    context.session_id,
    context.process_generation,
    context.cwd,
  ];
  return (
    state.runtime === scope.runtime &&
    JSON.stringify(expected) === JSON.stringify(actual) &&
    (state.job_id === scope.job_id || (owned !== null && state.job_id === owned))
  );
}

function useCommandPending(): {
  readonly current: () => boolean;
  readonly run: (work: () => Promise<boolean>) => Promise<boolean>;
} {
  const pending = useRef(false);
  return {
    current: (): boolean => pending.current,
    run: async (work): Promise<boolean> => {
      pending.current = true;
      try {
        return await work();
      } finally {
        pending.current = false;
      }
    },
  };
}
function acceptedArguments(command: CommandDescriptor, line: string): string {
  return command.arguments ? commandArguments(line) : '';
}
