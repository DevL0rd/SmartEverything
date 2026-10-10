import type { FunctionDeclaration } from '@google/genai';
import { recordArgument, stringArgument } from './arguments';
import { confirmationRequest, needsConfirmation } from './confirmation';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolCaller,
  type ToolSource,
  type ToolSpec,
} from './hub-tool';
import { geminiDeclarationOf, openAiToolOf, type OpenAiTool } from './tool-adapters';
import { META_TOOL_NAMES, catalogueOf } from './tool-sets';

export type ToolCheck =
  { readonly ok: true; readonly tool: HubTool } | { readonly ok: false; readonly reason: string };

export interface ToolCallRecord {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly caller: ToolCaller;
  readonly result: HubToolResult;
}

export type ToolWatcher = (call: ToolCallRecord) => void;

export class ToolHub {
  private readonly sources: ToolSource[] = [];
  private readonly watchers = new Set<ToolWatcher>();

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

  watch(watcher: ToolWatcher): () => void {
    this.watchers.add(watcher);
    return (): void => {
      this.watchers.delete(watcher);
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
    if (needsConfirmation(tool, args) && !caller.confirmed) {
      return { response: confirmationRequest(tool), line: '', pictures: [] };
    }
    const result = await source
      .call(tool, args, caller)
      .catch((cause: unknown) =>
        failure(cause instanceof Error ? cause.message : 'That did not work'),
      );
    this.watchers.forEach((watcher) => {
      watcher({ name, args, caller, result });
    });
    return result;
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
    return catalogueOf(set);
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
