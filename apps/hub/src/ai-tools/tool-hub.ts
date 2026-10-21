import { withExecutionAuthority, currentExecutionAuthority } from '../assistant/turn-authority';
import type { FunctionDeclaration } from '@google/genai';
import { pluginToolName, MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import { Logger, messageOf, failureLine } from '@smarteverything/logging';
import {
  CALL_TOOL_INPUT,
  SEARCH_TOOLS_INPUT,
  ToolDiscoveryError,
  discoveryInput,
  searchTools,
  toolDetails,
  type SearchScope,
} from './tool-discovery';
import { operationLookup } from '../extensions/mcp/tools/operation-details';
import { toolExamples } from '../extensions/mcp/tools/examples';
import { sharedSchemaNamed } from '../extensions/mcp/tools/shared-schemas';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolCaller,
  type ToolSource,
  type ToolSpec,
} from './hub-tool';
import type { PluginTurnRefusedError } from './plugin-turn';
import { toolRefusal } from './plugin-turn-tools';
import { geminiDeclarationOf, openAiToolOf, type OpenAiTool } from './tool-adapters';
import { META_TOOL_NAMES, META_TOOLS, chatCatalogue, toolIndex } from './tool-sets';
import type { ToolAdmission } from './tool-admission';

const log = new Logger('hub.ai-tools');

const CHAT_SCOPE: SearchScope = {
  operations: operationLookup(() => true),
  schema: sharedSchemaNamed,
  examples: toolExamples,
};

export type ToolCheck =
  { readonly ok: true; readonly tool: HubTool } | { readonly ok: false; readonly reason: string };

export class ToolHub {
  private readonly sources: ToolSource[] = [];
  private readonly listeners = new Map<() => void, Map<ToolSource, () => void>>();

  constructor(
    sources: readonly ToolSource[],
    private readonly admission: ToolAdmission | null = null,
  ) {
    this.sources.push(...sources);
  }

  add(source: ToolSource): () => void {
    this.sources.push(source);
    for (const [listener, stops] of this.listeners) {
      stops.set(source, source.changes(listener));
      listener();
    }
    return (): void => {
      const index = this.sources.indexOf(source);
      if (index >= 0) {
        this.sources.splice(index, 1);
        for (const [listener, stops] of this.listeners) {
          stops.get(source)?.();
          stops.delete(source);
          listener();
        }
      }
    };
  }

  list(): HubTool[] {
    return this.sources
      .flatMap((source) => source.tools())
      .filter((tool) => !tool.humanOnly)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  restrict(visible: (tool: HubTool) => boolean): ToolHub {
    return new ToolHub(
      [
        {
          tools: () => this.list().filter(visible),
          call: (tool, args, caller) => this.callAdmitted(tool.name, args, caller),
          validate: (tool, args): string | null => {
            const checked = this.check(tool.name, args);
            return checked.ok ? null : checked.reason;
          },
          changes: (listener) => this.changes(listener),
        },
      ],
      this.admission,
    );
  }

  call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    return this.settled(name, args, caller, () => {
      const target = forwardedCall(name, args);
      const admitted = this.admission?.(target.name, target.arguments, caller) ?? caller;
      return this.run(target.name, target.arguments, admitted);
    });
  }

  callAdmitted(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    return this.settled(name, args, caller, () => {
      const target = forwardedCall(name, args);
      return this.run(target.name, target.arguments, caller);
    });
  }

  private async settled(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
    work: () => Promise<HubToolResult>,
  ): Promise<HubToolResult> {
    const startedAt = performance.now();
    const fields = {
      tool: name,
      argumentKeys: Object.keys(args).length,
      chatId: caller.chatId,
      profileId: caller.profileId,
      role: caller.role,
      via: caller.via,
      plugin: caller.pluginId,
    };
    log.debug('tool.called', fields);
    try {
      const result = await work();
      const error = result.response['error'];
      const finished = {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
        pictures: result.pictures.length,
      };
      if (typeof error === 'string') {
        log.warn('tool.failed', {
          ...finished,
          failureCode: result.response['code'],
          reason: error,
        });
      } else {
        log.info('tool.finished', finished);
      }
      return result;
    } catch (cause) {
      log.warn('tool.refused', {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
        cause: failureLine(cause),
      });
      if (cause instanceof ToolDiscoveryError) return failure(cause.message, { code: cause.code });
      return failure(messageOf(cause));
    }
  }

  private async run(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    if (caller.pluginRequester !== undefined) {
      const refusal = this.pluginTurnRefusal(name, args);
      if (refusal !== null) throw refusal;
    }
    const found = this.locate(name);
    if (found === null) {
      log.warn('tool.unavailable', { tool: name, chatId: caller.chatId });
      return failure(`There is no tool named ${name}, or it is switched off`);
    }
    if (MCP_DISCOVERY_TOOLS.has(name)) {
      const response =
        name === META_TOOL_NAMES.search
          ? searchTools(this.list(), args, CHAT_SCOPE)
          : toolDetails(this.list(), args, CHAT_SCOPE);
      return { response, line: '', pictures: [] };
    }
    return await withExecutionAuthority(caller.authority ?? currentExecutionAuthority(), () =>
      found.source.call(found.tool, args, caller),
    );
  }

  check(asked: string, askedArgs: Readonly<Record<string, unknown>>): ToolCheck {
    try {
      const { name, arguments: args } = forwardedCall(asked, askedArgs);
      const found = this.locate(name);
      if (found === null) {
        return { ok: false, reason: `There is no tool named ${name}, or it is switched off` };
      }
      if (MCP_DISCOVERY_TOOLS.has(name)) {
        if (name === META_TOOL_NAMES.search) {
          discoveryInput(SEARCH_TOOLS_INPUT, args);
        } else {
          toolDetails(this.list(), args, CHAT_SCOPE);
        }
        return { ok: true, tool: found.tool };
      }
      const reason = found.source.validate(found.tool, args);
      return reason === null ? { ok: true, tool: found.tool } : { ok: false, reason };
    } catch (cause) {
      return {
        ok: false,
        reason: messageOf(cause),
      };
    }
  }

  pluginTurnRefusal(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PluginTurnRefusedError | null {
    if (name === META_TOOL_NAMES.call) {
      const call = CALL_TOOL_INPUT.safeParse(args);
      return call.success && !META_TOOLS.some((tool) => tool.name === call.data.name)
        ? this.pluginTurnRefusal(call.data.name, call.data.arguments)
        : null;
    }
    return toolRefusal(
      name,
      args,
      (pluginId, tool) => this.locate(pluginToolName(pluginId, tool))?.tool,
    );
  }

  changes(listener: () => void): () => void {
    const stops = new Map(
      this.sources.map((source) => [source, source.changes(listener)] as const),
    );
    this.listeners.set(listener, stops);
    return (): void => {
      this.listeners.delete(listener);
      for (const stop of stops.values()) stop();
    };
  }

  geminiDeclarations(set: readonly ToolSpec[]): FunctionDeclaration[] {
    return set.map(geminiDeclarationOf);
  }

  openAiTools(set: readonly ToolSpec[]): OpenAiTool[] {
    return set.map(openAiToolOf);
  }

  catalogue(set: readonly HubTool[]): string {
    return chatCatalogue(set);
  }

  index(set: readonly HubTool[]): string {
    return toolIndex(set);
  }

  private locate(name: string): { tool: HubTool; source: ToolSource } | null {
    for (const source of this.sources) {
      const tool = source
        .tools()
        .find((candidate) => candidate.name === name && !candidate.humanOnly);
      if (tool !== undefined) {
        return { tool, source };
      }
    }
    return null;
  }
}

export function forwardedCall(
  name: string,
  args: Readonly<Record<string, unknown>>,
): ReturnType<typeof CALL_TOOL_INPUT.parse> {
  if (name !== META_TOOL_NAMES.call) return { name, arguments: args };
  const call = discoveryInput(CALL_TOOL_INPUT, args);
  if (META_TOOLS.some((tool) => tool.name === call.name)) {
    throw new ToolDiscoveryError(
      'tool_call cannot forward discovery or itself; call those directly',
    );
  }
  return call;
}
