import {
  JSON_VALUE,
  ApiError,
  type ProviderContent,
  type AiChatRow,
  type ProviderEvent,
  type ComputerAiRuntime,
  type CodexProviderEvent,
  type ProviderTurn,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HubToolResult, ToolCaller } from '../../../ai-tools/hub-tool';
import type { ToolHub } from '../../../ai-tools/tool-hub';
import { chatSet, META_TOOL_NAMES } from '../../../ai-tools/tool-sets';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
import { withProviderToolAuthority } from './tool-authority';
import { runtimeValue } from './request';
import { ProviderToolTrace, invalidArguments, outsideGrant } from './tool-trace';
import { scopedHub } from '../../coordination/scoped-tools';

export interface ProviderGrant {
  readonly hub: ToolHub | null;
  readonly names: ReadonlySet<string>;
  readonly tools: ProviderTurn['tools'];
}

export function providerGrant(hub: ToolHub | null, chat: AiChatRow): ProviderGrant {
  const scoped = scopedHub(hub, chat.tools);
  const names = new Set(scoped?.list().map((tool) => tool.name) ?? []);
  if (scoped !== null) names.add(META_TOOL_NAMES.call);
  const frozen = scoped === null ? null : scoped.restrict((tool) => names.has(tool.name));
  const set = frozen === null ? [] : chatSet(frozen.list());
  return {
    hub: frozen,
    names,
    tools: set.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: z.record(z.string(), JSON_VALUE).parse(tool.inputSchema),
    })),
  };
}

export interface ProviderToolRoute {
  readonly directory: ComputerAiDirectory;
  readonly deviceId: string;
  readonly runtime: ComputerAiRuntime;
  readonly grant: ProviderGrant;
  readonly caller: ToolCaller;
  readonly validate: (write: boolean) => void;
  readonly hubOsBan?: boolean;
}
export async function routeProviderTool(
  route: ProviderToolRoute,
  event: Extract<ProviderEvent | CodexProviderEvent, { kind: 'tool_call' }>,
): Promise<{ readonly line: string; readonly failed: boolean; readonly output: string }> {
  const { directory, deviceId, grant, caller } = route;
  const trace = new ProviderToolTrace(event, caller, route.runtime, deviceId);
  const result = await withProviderToolAuthority(
    { validate: route.validate, hubOsBan: route.hubOsBan === true },
    () => toolResult(grant, caller, event),
  );
  route.validate(false);
  const text = JSON.stringify(result.response);
  const responseText = nativeToolResponse(text);
  const failed = 'error' in result.response || responseText !== text;
  const content: ProviderContent[] = [{ type: 'text', text: responseText }];
  for (const picture of result.pictures) {
    const parsed = IMAGE_MIME.safeParse(picture.mimeType);
    if (!parsed.success)
      throw new ApiError(
        'upstream_failed',
        'The tool returned an image format unsupported by the Claude provider.',
      );
    content.push({ type: 'image', media_type: parsed.data, data: picture.data.toString('base64') });
  }
  if (route.runtime === 'codex' && result.pictures.length > 0)
    throw new ApiError(
      'conflict',
      'Codex dynamic home tool output supports text only; images require explicit staging.',
    );
  const request = {
    operation: 'provider_tool_result' as const,
    job_id: event.job_id,
    call_id: event.call_id,
    text: responseText,
    failed,
    ...TOOL_RESULT_CONTENT[route.runtime](content),
  };
  const response = await runtimeValue(
    directory,
    { device_id: deviceId, runtime: route.runtime },
    route.runtime === 'claude' ? { runtime: 'claude', request } : { runtime: 'codex', request },
    z.strictObject({ delivered: z.boolean() }),
  );
  trace.answered(result, response.delivered, text.length, responseText !== text);
  if (!response.delivered)
    throw new ApiError('conflict', 'The Claude computer no longer recognizes this tool request.');
  return { line: result.line, failed, output: text };
}

const TOOL_RESULT_CONTENT = {
  claude: (content: ProviderContent[]): { readonly content: ProviderContent[] } => ({ content }),
  codex: (_content: ProviderContent[]): Record<string, never> => ({}),
};

const IMAGE_MIME = z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function toolResult(
  grant: ProviderGrant,
  caller: ToolCaller,
  event: Extract<ProviderEvent | CodexProviderEvent, { kind: 'tool_call' }>,
): Promise<HubToolResult> {
  if (grant.hub === null || !grant.names.has(event.name)) {
    outsideGrant(event, caller, grant.names.size);
    return {
      response: { error: 'This tool is outside the immutable chat grant.' },
      line: '',
      pictures: [],
    };
  }
  const checked = grant.hub.check(event.name, event.input);
  if (!checked.ok) {
    invalidArguments(event, caller, checked.reason);
    return { response: { error: checked.reason }, line: '', pictures: [] };
  }
  return grant.hub.call(event.name, event.input, caller);
}

function nativeToolResponse(text: string): string {
  if (text.length <= 200_000) return text;
  return JSON.stringify({
    error:
      'The complete output exceeds the native transport limit. The full output is kept in the chat; read it a page at a time with read_tool_result (chatId, callId, offset, limit). Nothing was lost.',
    output_characters: text.length,
    transport_limit: 200_000,
  });
}
