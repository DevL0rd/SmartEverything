import type {
  ComputerAiExecute,
  ComputerAiRead,
  ComputerAiReply,
  ComputerAiCapabilities,
  ClaudeNotice,
  ProviderEvent,
} from '@smarteverything/domain';

export type ComputerAiHostEvent =
  | { readonly kind: 'capabilities'; readonly capabilities: ComputerAiCapabilities }
  | { readonly kind: 'native'; readonly notice: ClaudeNotice }
  | { readonly kind: 'provider'; readonly event: ProviderEvent };

export interface ComputerAiHost {
  readonly nativeCommandRevision?: string;
  readonly read: (request: ComputerAiRead) => Promise<ComputerAiReply>;
  readonly execute: (request: ComputerAiExecute) => Promise<ComputerAiReply>;
  readonly onEvent: (listener: (event: ComputerAiHostEvent) => void) => () => void;
  readonly stop: () => void;
}
