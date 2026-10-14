import {
  ApiError,
  type ComputerAiRuntime,
  type ComputerRuntimeRead,
  type ComputerRuntimeExecute,
  type ComputerRuntimeReply,
  type ComputerRuntimeCapabilities,
  type ComputerRuntimeNativeEvent,
  type ComputerRuntimeProviderEvent,
} from '@smarteverything/domain';
import type { ComputerAiHost } from './ai-host';

export type ComputerRuntimeHostEvent =
  | {
      readonly kind: 'capabilities';
      readonly runtime: ComputerAiRuntime;
      readonly capabilities: ComputerRuntimeCapabilities;
    }
  | ({ readonly kind: 'native' } & ComputerRuntimeNativeEvent)
  | ({ readonly kind: 'provider' } & ComputerRuntimeProviderEvent);
export interface ComputerRuntimeHost {
  readonly runtime: ComputerAiRuntime;
  readonly read: (request: ComputerRuntimeRead) => Promise<ComputerRuntimeReply>;
  readonly execute: (request: ComputerRuntimeExecute) => Promise<ComputerRuntimeReply>;
  readonly onEvent: (listener: (event: ComputerRuntimeHostEvent) => void) => () => void;
  readonly stop: () => void;
}
export function adaptClaudeHost(host: ComputerAiHost): ComputerRuntimeHost {
  return {
    runtime: 'claude',
    read: async (envelope): Promise<ComputerRuntimeReply> => {
      if (envelope.runtime !== 'claude')
        throw new ApiError('invalid_request', 'A Claude host requires a Claude request.');
      return { runtime: 'claude', reply: await host.read(envelope.request) };
    },
    execute: async (envelope): Promise<ComputerRuntimeReply> => {
      if (envelope.runtime !== 'claude')
        throw new ApiError('invalid_request', 'A Claude host requires a Claude request.');
      return { runtime: 'claude', reply: await host.execute(envelope.request) };
    },
    onEvent: (listener): (() => void) =>
      host.onEvent((event) => {
        if (event.kind === 'capabilities') {
          listener({
            kind: 'capabilities',
            runtime: 'claude',
            capabilities: {
              ...event.capabilities,
              capability_revision: host.nativeCommandRevision ?? 'claude-v1',
              authentication: 'unknown',
              subscription: 'unverified',
              input_modalities: [],
              local_features: {},
            },
          });
          return;
        }
        listener({ ...event, runtime: 'claude' });
      }),
    stop: (): void => {
      host.stop();
    },
  };
}
