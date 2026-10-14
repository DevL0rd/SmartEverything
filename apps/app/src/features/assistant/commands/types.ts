import type { z } from 'zod';
import type { QueryClient } from '@tanstack/react-query';
import type {
  AiHarnessCommandScope,
  AiHarnessCommandDescriptor,
  AiNativeCommandScope,
  AiHarnessCommandWrite,
  AI_NATIVE_COMMAND_DESCRIPTOR,
} from '@smarteverything/domain';
import type { AssistantWriteScope } from '../../../store/assistant-response-style';
export type CommandScope =
  | { readonly kind: 'dsh'; readonly value: AiHarnessCommandScope }
  | { readonly kind: 'native'; readonly value: AiNativeCommandScope };
export type NativeExpectation = Omit<
  AiNativeCommandScope,
  'version' | 'connection_generation' | 'catalogue_revision'
>;
export type CommandTarget =
  | { readonly kind: 'dsh'; readonly scope: AiHarnessCommandScope }
  | { readonly kind: 'native'; readonly expected: NativeExpectation };
export interface CommandBinding {
  readonly key: string;
  readonly discoveryKey: string;
  readonly chatId: string | null;
  readonly target: CommandTarget | null;
  readonly reason: string | null;
  readonly retry: () => void;
}
export interface CommandDescriptor extends AiHarnessCommandDescriptor {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly enabled: boolean;
  readonly arguments: boolean;
  readonly unavailableReason: string | null;
  readonly native?: z.output<typeof AI_NATIVE_COMMAND_DESCRIPTOR>;
}
export interface DiscoveredCommands {
  readonly scope: CommandScope;
  readonly commands: readonly CommandDescriptor[];
}
export type CommandCompletion =
  'complete' | 'compacted' | 'no change' | 'interrupted' | 'failed' | 'not run';
export type CommandOutcome =
  | { readonly status: 'settled'; readonly completion: CommandCompletion; readonly text: string }
  | { readonly status: 'rejected' | 'unknown'; readonly text: string };
export interface CommandExecution {
  readonly chatId: string;
  readonly scopeKey: string;
  readonly scope: CommandScope;
  readonly command: CommandDescriptor;
  readonly line: string;
  readonly arguments: string;
  readonly attachments: AiHarnessCommandWrite['attachments'];
  readonly authority: AssistantWriteScope;
  readonly client: QueryClient;
  readonly signal: AbortSignal;
  readonly ownNativeJob: (jobId: string) => void;
  readonly progress: (state: 'admitted' | 'running', text: string) => void;
}
export interface CommandAdapter {
  readonly discover: (binding: CommandBinding) => Promise<DiscoveredCommands>;
  readonly execute: (input: CommandExecution) => Promise<CommandOutcome>;
}

export class CommandBindingError extends Error {
  override readonly name = 'CommandBindingError';
  constructor(
    message: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(message);
  }
}
