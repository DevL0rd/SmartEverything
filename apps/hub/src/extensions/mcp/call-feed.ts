import type { AcceptedCaller } from './bearer';

export interface McpToolCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly output: unknown;
  readonly caller: AcceptedCaller | null;
}

export type McpCallWatcher = (call: McpToolCall) => void;

export class McpCallFeed {
  private readonly watchers = new Set<McpCallWatcher>();

  watch(watcher: McpCallWatcher): () => void {
    this.watchers.add(watcher);
    return (): void => {
      this.watchers.delete(watcher);
    };
  }

  called(call: McpToolCall): void {
    this.watchers.forEach((watcher) => {
      watcher(call);
    });
  }
}
