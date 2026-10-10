import type { ChatToolItem } from '@smarteverything/domain';
import { z } from 'zod';
import type { HubToolResult, ToolCaller } from '../../../ai-tools/hub-tool';
import type { ToolHub } from '../../../ai-tools/tool-hub';
import type { ChatMessage, ContentPart, ToolCall } from '../../../openrouter/chat-types';

const RESULT_CHARACTERS = 20_000;

const ARGUMENTS = z.record(z.string(), z.unknown());

export interface ToolRun {
  readonly messages: readonly ChatMessage[];
  readonly lines: readonly string[];
}

export interface ToolRunOptions {
  readonly hub: ToolHub;
  readonly caller: ToolCaller;
  readonly tool: (item: ChatToolItem) => void;
  readonly images: PictureReader;
}

export interface PictureReader {
  readonly model: string;
  readonly allowed: boolean;
}

function argumentsOf(call: ToolCall): Readonly<Record<string, unknown>> | null {
  if (call.function.arguments.trim() === '') {
    return {};
  }
  try {
    const parsed = ARGUMENTS.safeParse(JSON.parse(call.function.arguments));
    return parsed.success ? parsed.data : null;
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) {
      throw cause;
    }
    return null;
  }
}

function capped(text: string): string {
  return text.length > RESULT_CHARACTERS
    ? `${text.slice(0, RESULT_CHARACTERS)}… (cut; ask for less, for example with filters)`
    : text;
}

function toolNameOf(call: ToolCall, args: Readonly<Record<string, unknown>> | null): string {
  const inner = call.function.name === 'call_tool' ? args?.['name'] : undefined;
  return typeof inner === 'string' ? inner : call.function.name;
}

function picturePartsOf(name: string, result: HubToolResult, reader: PictureReader): ContentPart[] {
  const count = result.pictures.length;
  if (!reader.allowed) {
    return [
      {
        type: 'text',
        text: `[${name} returned ${String(count)} picture(s); not shown because ${reader.model} cannot read images]`,
      },
    ];
  }
  return [
    { type: 'text', text: `[Picture from ${name}]` },
    ...result.pictures.map((picture) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${picture.mimeType};base64,${picture.data.toString('base64')}` },
    })),
  ];
}

function picturesMessage(
  done: readonly { readonly call: ToolCall; readonly result: HubToolResult }[],
  reader: PictureReader,
): ChatMessage[] {
  const parts = done
    .filter(({ result }) => result.pictures.length > 0)
    .flatMap(({ call, result }) =>
      picturePartsOf(toolNameOf(call, argumentsOf(call)), result, reader),
    );
  return parts.length === 0 ? [] : [{ role: 'user', content: parts }];
}

function titleOf(hub: ToolHub, name: string): string {
  const tool = hub.list().find((candidate) => candidate.name === name);
  return tool?.title ?? name.replaceAll('_', ' ');
}

function readOnly(hub: ToolHub, call: ToolCall): boolean {
  const name = toolNameOf(call, argumentsOf(call));
  return hub.list().find((tool) => tool.name === name)?.annotations.readOnlyHint ?? true;
}

function detailOf(result: HubToolResult): string | null {
  const error = result.response['error'];
  if (typeof error === 'string') {
    return error.slice(0, 400);
  }
  return result.line === '' ? null : result.line.slice(0, 400);
}

async function runOne(call: ToolCall, options: ToolRunOptions): Promise<HubToolResult> {
  const args = argumentsOf(call);
  const name = toolNameOf(call, args);
  const base = { callId: call.id, name, title: titleOf(options.hub, name) };
  options.tool({ ...base, state: 'running', detail: null });
  const result: HubToolResult =
    args === null
      ? {
          response: { error: 'The arguments are not a JSON object; send them as JSON.' },
          line: '',
          pictures: [],
        }
      : await options.hub.call(call.function.name, args, options.caller);
  const failed = typeof result.response['error'] === 'string';
  options.tool({ ...base, state: failed ? 'failed' : 'done', detail: detailOf(result) });
  return result;
}

export async function runTools(
  calls: readonly ToolCall[],
  options: ToolRunOptions,
): Promise<ToolRun> {
  const done = await Promise.all(
    calls.map(async (call) => ({ call, result: await runOne(call, options) })),
  );
  return {
    messages: [
      ...done.map(({ call, result }): ChatMessage => ({
        role: 'tool',
        tool_call_id: call.id,
        content: capped(JSON.stringify(result.response)),
      })),
      ...picturesMessage(done, options.images),
    ],
    lines: done
      .filter(({ call }) => !readOnly(options.hub, call))
      .map(({ result }) => result.line)
      .filter((line) => line !== ''),
  };
}
