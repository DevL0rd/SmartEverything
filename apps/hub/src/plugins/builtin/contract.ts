import type {
  HealthRecord,
  InboundMessage,
  JsonValue,
  PluginEvent,
  PluginManifest,
  PluginManifestInput,
  PluginOptionPage,
  PluginOptionQuery,
  PluginPerson,
  PluginPersonChange,
  PluginRequester,
  PluginSearchEntry,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { HubToolResult, ToolAnnotationHints, ToolCaller } from '../../ai-tools/hub-tool';
import type { DeviceDriver, DeviceDriverContext } from '../../local/device-driver';
import type { PluginNetwork } from '../plugin-listen';
import type { PluginSpeaker } from '../plugin-speakers';
import type { PluginVoice } from '../plugin-voice';

export type { DeviceDriverContext, ToolCaller };

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

export type PluginOptionProvider = (query: PluginOptionQuery) => Promise<PluginOptionPage>;

interface PluginOptions {
  readonly register: (source: string, provider: PluginOptionProvider) => Unsubscribe;
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

interface PluginClients {
  readonly gone: (listener: (clientId: string) => void) => Unsubscribe;
}

export interface PluginMetrics {
  readonly push: (externalId: string, key: string, value: number, at: string) => void;
}

interface PluginMessages {
  readonly post: (message: InboundMessage) => void;
}

export interface PluginPeopleView {
  readonly save: (externalId: string, change: PluginPersonChange) => PluginPerson;
  readonly find: (externalId: string) => PluginPerson | null;
  readonly list: () => readonly PluginPerson[];
  readonly requesterOf: (externalId: string) => PluginRequester;
  readonly watch: (listener: () => void) => Unsubscribe;
}

interface PluginReachTargets {
  readonly register: (speaker: PluginSpeaker) => Unsubscribe;
}

export interface PluginConversationState {
  readonly title: string;
  readonly state: 'ready' | 'working' | 'unavailable';
  readonly reason: string | null;
  readonly model: string | null;
  readonly costMicros: number;
}

export interface PluginUsageSpan {
  readonly costMicros: number;
  readonly calls: number;
}

export interface PluginUsageView {
  readonly today: PluginUsageSpan;
  readonly week: PluginUsageSpan;
  readonly month: PluginUsageSpan;
}

export interface PluginAssistant {
  readonly settings: () => {
    readonly name: string | null;
    readonly aliases: readonly string[];
    readonly activitySteps: boolean;
    readonly reuseChatMinutes: number;
    readonly compactAtPercent: number;
  };
  readonly conversation: (key: string, actor?: string) => PluginConversationState | null;
  readonly usage: (actor?: string) => PluginUsageView;
  readonly compact: (key: string, actor?: string) => Promise<boolean>;
  readonly startOver: (key: string, actor?: string) => Promise<boolean>;
  readonly stop: (key: string, actor?: string) => Promise<boolean>;
  readonly setModel: (key: string, model: string | null, actor?: string) => Promise<string | null>;
}

interface MachineFile {
  readonly data: Buffer;
  readonly name: string;
}

export interface PluginFiles {
  readonly folder: string;
  readonly outbox: string;
  readonly attachmentsOf: (chatId: string) => readonly string[];
  readonly fromUpload: (caller: ToolCaller, uploadId: string) => Promise<MachineFile | null>;
  readonly fromMachine: (
    caller: ToolCaller,
    input: { readonly machine: string; readonly path: string },
  ) => Promise<MachineFile | null>;
}

export interface PluginContext<S> {
  readonly manifest: PluginManifest;
  readonly settings: S;
  readonly settingsChanged: (listener: (settings: S) => void) => Unsubscribe;
  readonly secrets: PluginSecrets;
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly tools: { readonly register: (tools: readonly PluginTool[]) => void };
  readonly devices: {
    readonly register: (driver: DeviceDriver) => Unsubscribe;
    readonly command: (
      input: {
        readonly externalId: string;
        readonly capability: string;
        readonly value: JsonValue;
        readonly transient?: boolean;
      },
      caller: ToolCaller,
    ) => Promise<JsonValue>;
  };
  readonly data: { readonly publish: (stream: string, value: JsonValue) => void };
  readonly events: { readonly emit: (event: PluginEvent) => void };
  readonly options: PluginOptions;
  readonly search: { readonly replace: (entries: readonly PluginSearchEntry[]) => void };
  readonly health: {
    readonly write: (profileId: string, records: readonly HealthRecord[]) => Promise<void>;
  };
  readonly records: (collection: string) => PluginRecords;
  readonly configure: (change: Partial<PluginConfiguration>, by?: ToolCaller) => Promise<void>;
  readonly viewers: PluginViewers;
  readonly clients: PluginClients;
  readonly metrics: PluginMetrics;
  readonly messages: PluginMessages;
  readonly people: PluginPeopleView;
  readonly reach: PluginReachTargets;
  readonly network: PluginNetwork;
  readonly voice: PluginVoice;
  readonly assistant: PluginAssistant;
  readonly files: PluginFiles;
  readonly home: {
    readonly timeZone: () => string;
    readonly profiles: () => readonly { readonly id: string; readonly name: string }[];
    readonly phone: (profileId: string) => {
      readonly paired: boolean;
      readonly place: string | null;
    };
  };
}

export interface BuiltinPluginDefinition<S> {
  readonly manifest: PluginManifestInput;
  readonly settings: z.ZodType<S>;
  readonly start: (context: PluginContext<S>) => Promise<PluginStop>;
}

export type PluginHostContext = Omit<PluginContext<unknown>, 'settings' | 'settingsChanged'> & {
  readonly watchSettings: (
    listener: (settings: Readonly<Record<string, JsonValue>>) => void,
  ) => Unsubscribe;
};

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
