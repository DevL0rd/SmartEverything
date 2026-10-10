import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Clock } from '../clock';
import type { McpCallFeed } from '../extensions/mcp/call-feed';
import type { Store } from '../store/store';
import { ChatWidgets } from './chat-widgets';
import { OpenWorkerChats } from './worker-chats';

export interface ChatWidgetsHost {
  readonly store: Store;
  readonly clock: Clock;
  readonly tools: ToolHub;
  readonly context: { readonly toolCalls: McpCallFeed };
  readonly log: Logger;
}

export function startChatWidgets(host: ChatWidgetsHost): () => void {
  const workers = new OpenWorkerChats(host.store);
  const widgets = new ChatWidgets({
    store: host.store,
    workers,
    now: host.clock.now,
    log: host.log.forArea('hub.chat-widgets'),
  });
  const stops = [
    workers.start(),
    widgets.start(),
    host.tools.watch((call) => {
      widgets.called(call);
    }),
    host.context.toolCalls.watch((call) => {
      widgets.mcpCalled(call);
    }),
  ];
  return (): void => {
    stops.forEach((stop) => {
      stop();
    });
  };
}
