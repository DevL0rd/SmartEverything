import type { ChatWidget } from '@smarteverything/domain';

export interface WidgetFacts {
  readonly deviceWidget: (deviceId: string) => ChatWidget | null;
  readonly remoteId: (remote: string) => string | null;
  readonly pluginIds: () => readonly string[];
}

export interface RuleInput {
  readonly args: Readonly<Record<string, unknown>>;
  readonly output: unknown;
}

export interface WidgetRule {
  readonly tools: readonly string[];
  readonly widgets: (input: RuleInput, facts: WidgetFacts) => readonly ChatWidget[];
}
