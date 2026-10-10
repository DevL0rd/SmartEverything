import type { FunctionDeclaration } from '@google/genai';
import { pluginToolName } from '@smarteverything/domain';
import { recordArgument, stringArgument } from './arguments';
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
import { META_TOOL_NAMES, chatCatalogue, toolIndex } from './tool-sets';

export type ToolCheck =
  { readonly ok: true; readonly tool: HubTool } | { readonly ok: false; readonly reason: string };

export class ToolHub {
  private readonly sources: ToolSource[] = [];

  constructor(sources: readonly ToolSource[]) {
    this.sources.push(...sources);
  }

  add(source: ToolSource): () => void {
    this.sources.push(source);
    return (): void => {
      const index = this.sources.indexOf(source);
      if (index >= 0) {
        this.sources.splice(index, 1);
      }
    };
  }

  list(): HubTool[] {
    return this.sources.flatMap((source) => source.tools());
  }

  async call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    if (name === META_TOOL_NAMES.call) {
      return this.call(stringArgument(args, 'name'), recordArgument(args, 'arguments'), caller);
    }
    const found = this.locate(name);
    if (found === null) {
      return failure(`There is no tool named ${name}, or it is switched off`);
    }
    const { tool, source } = found;
    return source
      .call(tool, args, caller)
      .catch((cause: unknown) =>
        failure(cause instanceof Error ? cause.message : 'That did not work'),
      );
  }

  check(name: string, args: Readonly<Record<string, unknown>>): ToolCheck {
    if (name === META_TOOL_NAMES.call) {
      return this.check(stringArgument(args, 'name'), recordArgument(args, 'arguments'));
    }
    const found = this.locate(name);
    if (found === null) {
      return { ok: false, reason: `There is no tool named ${name}, or it is switched off` };
    }
    const reason = found.source.validate(found.tool, args);
    return reason === null ? { ok: true, tool: found.tool } : { ok: false, reason };
  }

  pluginTurnRefusal(
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): PluginTurnRefusedError | null {
    if (name === META_TOOL_NAMES.call) {
      return this.pluginTurnRefusal(
        stringArgument(args, 'name'),
        recordArgument(args, 'arguments'),
      );
    }
    return toolRefusal(
      name,
      args,
      (pluginId, tool) => this.locate(pluginToolName(pluginId, tool))?.tool,
    );
  }

  changes(listener: () => void): () => void {
    const stops = this.sources.map((source) => source.changes(listener));
    return (): void => {
      stops.forEach((stop) => {
        stop();
      });
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
      const tool = source.tools().find((candidate) => candidate.name === name);
      if (tool !== undefined) {
        return { tool, source };
      }
    }
    return null;
  }
}
