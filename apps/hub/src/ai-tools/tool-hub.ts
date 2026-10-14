import {
  withExecutionAuthority,
  currentExecutionAuthority,
} from '../assistant/execution-authority';
import type { FunctionDeclaration } from '@google/genai';
import { pluginToolName } from '@smarteverything/domain';
import {
  CALL_TOOL_INPUT,
  DISCOVERY_NAMES,
  SEARCH_TOOLS_INPUT,
  ToolDiscoveryError,
  discoveryInput,
  searchTools,
  toolDetails,
} from './tool-discovery';
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

export type ToolCheck =
  { readonly ok: true; readonly tool: HubTool } | { readonly ok: false; readonly reason: string };

export class ToolHub {
  private readonly sources: ToolSource[] = [];
  private readonly listeners = new Map<() => void, Map<ToolSource, () => void>>();
  private admission:
    | ((name: string, args: Readonly<Record<string, unknown>>, caller: ToolCaller) => ToolCaller)
    | null = null;
  setAdmission(
    admit: (
      name: string,
      args: Readonly<Record<string, unknown>>,
      caller: ToolCaller,
    ) => ToolCaller,
  ): void {
    this.admission = admit;
  }

  constructor(sources: readonly ToolSource[]) {
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
    return new ToolHub([
      {
        tools: () => this.list().filter(visible),
        call: (tool, args, caller) => this.call(tool.name, args, caller),
        validate: (tool, args): string | null => {
          const checked = this.check(tool.name, args);
          return checked.ok ? null : checked.reason;
        },
        changes: (listener) => this.changes(listener),
      },
    ]);
  }

  async call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    try {
      const admitted = this.admission === null ? caller : this.admission(name, args, caller);
      if (name === META_TOOL_NAMES.call) {
        const call = forwarded(args);
        return await this.call(call.name, call.arguments, admitted);
      }
      return await this.called(name, args, admitted);
    } catch (cause) {
      return failure(cause instanceof Error ? cause.message : 'That did not work');
    }
  }

  private async called(
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
      return failure(`There is no tool named ${name}, or it is switched off`);
    }
    if (DISCOVERY_NAMES.has(name)) {
      const response =
        name === META_TOOL_NAMES.search
          ? searchTools(this.list(), args)
          : toolDetails(this.list(), args);
      return { response, line: '', pictures: [] };
    }
    const authority = caller.authority ?? currentExecutionAuthority();
    return await (authority === undefined
      ? found.source.call(found.tool, args, caller)
      : withExecutionAuthority(authority, () => found.source.call(found.tool, args, caller)));
  }

  check(name: string, args: Readonly<Record<string, unknown>>): ToolCheck {
    try {
      if (name === META_TOOL_NAMES.call) {
        const call = forwarded(args);
        return this.check(call.name, call.arguments);
      }
      const found = this.locate(name);
      if (found === null) {
        return { ok: false, reason: `There is no tool named ${name}, or it is switched off` };
      }
      if (DISCOVERY_NAMES.has(name)) {
        if (name === META_TOOL_NAMES.search) {
          discoveryInput(SEARCH_TOOLS_INPUT, args);
        } else {
          toolDetails(this.list(), args);
        }
        return { ok: true, tool: found.tool };
      }
      const reason = found.source.validate(found.tool, args);
      return reason === null ? { ok: true, tool: found.tool } : { ok: false, reason };
    } catch (cause) {
      return {
        ok: false,
        reason: cause instanceof Error ? cause.message : 'The arguments are not valid',
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

function forwarded(
  args: Readonly<Record<string, unknown>>,
): ReturnType<typeof CALL_TOOL_INPUT.parse> {
  const call = discoveryInput(CALL_TOOL_INPUT, args);
  if (META_TOOLS.some((tool) => tool.name === call.name)) {
    throw new ToolDiscoveryError(
      'invalid_request: call_tool cannot forward discovery or itself; call those directly',
    );
  }
  return call;
}
