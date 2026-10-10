import type {
  InboundMessage,
  JsonValue,
  PluginDataPoint,
  PluginEvent,
  PluginOptionPage,
  PluginOptionQuery,
  PluginSearchEntry,
  PluginStatus,
} from '@smarteverything/domain';
import type {
  HubToolResult,
  JsonSchema,
  ToolAnnotationHints,
  ToolCaller,
} from '../ai-tools/hub-tool';

export interface RuntimeTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly annotations: ToolAnnotationHints;
  readonly humanOnly: boolean;
}

export interface ContributionSinks {
  readonly message: (message: InboundMessage) => void;
  readonly data: (point: PluginDataPoint) => void;
  readonly event: (event: PluginEvent) => void;
  readonly search: (entries: readonly PluginSearchEntry[]) => void;
}

export interface RuntimeSinks extends ContributionSinks {
  readonly status: (status: PluginStatus, detail: string | null) => void;
  readonly toolsChanged: () => void;
  readonly log: (line: string) => void;
}

export interface PluginRuntime {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly settingsChanged: (settings: Readonly<Record<string, JsonValue>>) => void;
  readonly tools: () => readonly RuntimeTool[];
  readonly choices: (source: string, query: PluginOptionQuery) => Promise<PluginOptionPage>;
  readonly call: (
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ) => Promise<HubToolResult>;
}
