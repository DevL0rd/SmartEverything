import { ApiError, COMPUTER_AI_CAPABILITIES, type ComputerAiReply } from '@smarteverything/domain';
import type { ComputerAiHost } from './ai-host';
import type { ComputerRuntimeHost } from './runtime-host';

export function claudeHostOf(host: ComputerRuntimeHost): ComputerAiHost {
  if (host.runtime !== 'claude')
    throw new ApiError('invalid_request', 'Legacy Claude adapter requires a Claude runtime.');
  let revision = 'claude-v1';
  return {
    get nativeCommandRevision(): string {
      return revision;
    },
    read: async (request): Promise<ComputerAiReply> => {
      const result = await host.read({ runtime: 'claude', request });
      if (result.runtime !== 'claude')
        throw new ApiError('upstream_failed', 'Claude host returned another runtime.');
      return result.reply;
    },
    execute: async (request): Promise<ComputerAiReply> => {
      const result = await host.execute({ runtime: 'claude', request });
      if (result.runtime !== 'claude')
        throw new ApiError('upstream_failed', 'Claude host returned another runtime.');
      return result.reply;
    },
    onEvent: (listener) =>
      host.onEvent((event) => {
        if (event.runtime !== 'claude') return;
        if (event.kind === 'capabilities') {
          revision = event.capabilities.capability_revision;
          listener({
            kind: 'capabilities',
            capabilities: COMPUTER_AI_CAPABILITIES.strip().parse(event.capabilities),
          });
        } else if (event.kind === 'native') listener({ kind: 'native', notice: event.notice });
        else listener({ kind: 'provider', event: event.event });
      }),
    stop: (): void => {
      host.stop();
    },
  };
}
