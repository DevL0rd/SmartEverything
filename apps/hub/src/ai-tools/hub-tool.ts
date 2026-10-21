import type { ConversationAuthority } from '../harness/authority-contract';
import type { PluginRequester } from '@smarteverything/domain';

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly variants?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

export interface ToolAnnotationHints {
  readonly title?: string;
  readonly idempotentHint?: boolean;
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly openWorldHint: boolean;
}

type ToolOrigin =
  | { readonly kind: 'se' }
  | { readonly kind: 'core' }
  | { readonly kind: 'plugin'; readonly pluginId: string };

export interface HubTool extends ToolSpec {
  readonly title: string;
  readonly annotations: ToolAnnotationHints;
  readonly origin: ToolOrigin;
  readonly humanOnly: boolean;
}

type ToolVia = 'chat' | 'voice' | 'wake' | 'plugin' | 'schedule' | 'automation' | 'app';

export interface ToolCaller {
  readonly authority?: ConversationAuthority;
  readonly profileId: string;
  readonly role: 'owner' | 'member';
  readonly chatId: string | null;
  readonly callId?: string;
  readonly via: ToolVia;
  readonly clientId: string | null;
  readonly pluginRequester?: PluginRequester;
  readonly pluginId?: string;
}

export interface ToolPicture {
  readonly data: Buffer;
  readonly mimeType: string;
}

export interface HubToolResult {
  readonly response: Readonly<Record<string, unknown>>;
  readonly line: string;
  readonly pictures: readonly ToolPicture[];
}

export interface ToolSource {
  readonly tools: () => readonly HubTool[];
  readonly call: (
    tool: HubTool,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ) => Promise<HubToolResult>;
  readonly validate: (tool: HubTool, args: Readonly<Record<string, unknown>>) => string | null;
  readonly changes: (listener: () => void) => () => void;
}

export function failure(
  message: string,
  extra: Readonly<Record<string, unknown>> = {},
): HubToolResult {
  return { response: { error: message, ...extra }, line: '', pictures: [] };
}
