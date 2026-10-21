import {
  ApiError,
  CommandRefusedError,
  InvalidValueError,
  MCP_TOOLS,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { switchedOffTools } from '../../ai-tools/tool-discovery';
import { StoreNotFoundError } from '../../store/context';
import { TOOLS, shownOutput, toolNamed } from './tools';
import { areaRefusal } from './tools/person-reach';
import { readOnlyCaller, readOnlyRefusal, readsOnly } from './tools/read-only';
import { toolInScope, visibleTools } from './tools/visibility';
import {
  PLUGIN_ONLY_TOOLS,
  ToolError,
  internalRefusal,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from './tools/registry';

interface Refusal {
  readonly code: string;
  readonly message: string;
}

export type ToolRun =
  | { readonly kind: 'done'; readonly output: ToolOutput }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  | { readonly kind: 'unknown' };

function reachable(context: ToolContext, name: string): boolean {
  return context.caller?.via === 'plugin' || !PLUGIN_ONLY_TOOLS.has(name);
}

export function enabledTools(context: ToolContext): readonly Tool[] {
  return visibleTools(TOOLS, context).filter((tool) => reachable(context, tool.name));
}

function refusalOf(error: ToolError): Refusal {
  return { code: error.code, message: error.message };
}

function refusal(cause: unknown): Refusal | null {
  if (cause instanceof ToolError) {
    return refusalOf(cause);
  }
  if (cause instanceof ApiError) {
    return { code: cause.code, message: cause.message };
  }
  if (cause instanceof StoreNotFoundError) {
    return { code: 'not_found', message: cause.message };
  }
  if (cause instanceof CommandRefusedError || cause instanceof InvalidValueError) {
    return { code: 'command_refused', message: cause.message };
  }
  return null;
}

function unavailability(context: ToolContext, name: string, log: Logger): Refusal | null {
  if (!toolInScope(context, name)) {
    const area = MCP_TOOLS.find((candidate) => candidate.name === name)?.area ?? 'everything';
    return refusalOf(areaRefusal(context, name, area));
  }
  if (!reachable(context, name)) {
    return { code: 'forbidden', message: `${name} is only for a plugin handing over a message.` };
  }
  if (switchedOffTools(context.store.settings.read().mcp_disabled_tools).has(name)) {
    log.warn('tool.switched_off', { tool: name });
    return {
      code: 'tool_switched_off',
      message: `The owner turned off ${name}. They can turn it on in SmartEverything under Settings › AI assistants › Exposed tools.`,
    };
  }
  return null;
}

const SELECTOR_KEYS = ['action', 'view'] as const;

function selectorOf(args: Readonly<Record<string, unknown>>): string | undefined {
  for (const key of SELECTOR_KEYS) {
    const value = args[key];
    if (typeof value === 'string') {
      return value.slice(0, 40);
    }
  }
  return undefined;
}

function callFields(
  context: ToolContext,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    tool,
    action: selectorOf(args),
    argumentKeys: Object.keys(args).length,
    profileId: context.actor?.profileId,
    chatId: context.actor?.chatId,
    role: context.actor?.role,
    via: context.caller?.via,
    pluginId: context.actor?.pluginId,
  };
}

function resultSize(output: ToolOutput): number {
  return JSON.stringify(output.structured).length;
}

interface Invocation {
  readonly tool: Tool;
  readonly args: Readonly<Record<string, unknown>>;
  readonly fields: Record<string, unknown>;
}

async function invoke(context: ToolContext, call: Invocation, log: Logger): Promise<ToolRun> {
  const { tool, args, fields } = call;
  const startedAt = performance.now();
  log.debug('tool.called', fields);
  try {
    const output = await tool.call(
      { ...context, visibleTools: (): readonly Tool[] => enabledTools(context) },
      args,
    );
    const shown = shownOutput(tool.name, args, output);
    log.info('tool.succeeded', {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
      resultBytes: resultSize(shown),
      images: shown.images?.length ?? 0,
      changed: shown.action === true,
    });
    return { kind: 'done', output: shown };
  } catch (cause) {
    const refused = refusal(cause);
    if (refused === null) {
      log.error('tool.failed', cause, {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } else {
      log.warn('tool.refused', {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
        refusal: refused.code,
        message: refused.message,
      });
    }
    return { kind: 'refused', refusal: refused ?? refusalOf(internalRefusal(cause)) };
  }
}

export async function runTool(
  context: ToolContext,
  name: string,
  args: Readonly<Record<string, unknown>>,
  log: Logger,
): Promise<ToolRun> {
  const tool = toolNamed(name);
  if (tool === undefined) {
    log.warn('tool.unknown', { tool: name, via: context.caller?.via });
    return { kind: 'unknown' };
  }
  const fields = callFields(context, tool.name, args);
  const unavailable =
    readOnlyCaller(context) && !readsOnly(tool, args)
      ? { code: 'forbidden', message: readOnlyRefusal(tool) }
      : unavailability(context, tool.name, log);
  if (unavailable !== null) {
    log.warn('tool.unavailable', { ...fields, refusal: unavailable.code });
    return { kind: 'refused', refusal: unavailable };
  }
  return invoke(context, { tool, args, fields }, log);
}
