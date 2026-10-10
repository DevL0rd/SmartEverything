import type {
  HealthRecord,
  JsonValue,
  PluginEvent,
  PluginManifest,
  PluginManifestInput,
  PluginSearchEntry,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { HubToolResult, ToolAnnotationHints, ToolCaller } from '../../ai-tools/hub-tool';
import type { DeviceDriver } from '../../local/device-driver';

export type Unsubscribe = () => void;

export type PluginStop = () => Promise<void>;

export interface PluginToolDefinition<I> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: z.ZodType<I>;
  readonly annotations: ToolAnnotationHints;
  readonly humanOnly: boolean;
  readonly run: (input: I, caller: ToolCaller) => Promise<HubToolResult>;
}

export interface PluginTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: ToolAnnotationHints;
  readonly humanOnly: boolean;
  readonly validate: (raw: Readonly<Record<string, unknown>>) => string | null;
  readonly run: (
    raw: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ) => Promise<HubToolResult>;
}

export interface PluginSecrets {
  readonly get: (name: string) => string | null;
  readonly set: (name: string, value: string) => Promise<void>;
  readonly remove: (name: string) => Promise<void>;
}

export interface PluginRecords {
  readonly get: (key: string) => JsonValue | null;
  readonly list: () => readonly { readonly key: string; readonly value: JsonValue }[];
  readonly put: (key: string, value: JsonValue) => void;
  readonly remove: (key: string) => void;
}

export interface PluginConfiguration {
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly secrets: Readonly<Record<string, string>>;
}

export interface PluginViewers {
  readonly watchDevice: (externalId: string, onChange: (viewed: boolean) => void) => Unsubscribe;
}

export interface PluginMetrics {
  readonly push: (externalId: string, key: string, value: number, at: string) => void;
}

export interface PluginContext<S> {
  readonly manifest: PluginManifest;
  readonly settings: S;
  readonly secrets: PluginSecrets;
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly tools: { readonly register: (tools: readonly PluginTool[]) => void };
  readonly devices: { readonly register: (driver: DeviceDriver) => Unsubscribe };
  readonly data: { readonly publish: (stream: string, value: JsonValue) => void };
  readonly events: { readonly emit: (event: PluginEvent) => void };
  readonly search: { readonly replace: (entries: readonly PluginSearchEntry[]) => void };
  readonly health: {
    readonly write: (profileId: string, records: readonly HealthRecord[]) => Promise<void>;
  };
  readonly records: (collection: string) => PluginRecords;
  readonly configure: (change: Partial<PluginConfiguration>) => Promise<void>;
  readonly viewers: PluginViewers;
  readonly metrics: PluginMetrics;
}

export interface BuiltinPluginDefinition<S> {
  readonly manifest: PluginManifestInput;
  readonly settings: z.ZodType<S>;
  readonly start: (context: PluginContext<S>) => Promise<PluginStop>;
}

export type PluginHostContext = Omit<PluginContext<unknown>, 'settings'>;

export type BuiltinStart =
  | { readonly ok: true; readonly stop: PluginStop }
  | { readonly ok: false; readonly reason: string };

export interface BuiltinPlugin {
  readonly manifest: PluginManifestInput;
  readonly validate: (settings: Readonly<Record<string, JsonValue>>) => string | null;
  readonly start: (
    context: PluginHostContext,
    settings: Readonly<Record<string, JsonValue>>,
  ) => Promise<BuiltinStart>;
}
