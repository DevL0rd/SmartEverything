import { HARNESS_CENTRAL_CATALOGUE } from '@smarteverything/domain';
import type { z } from 'zod';
import type { HomeTool } from '@smarteverything/harness/process';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { ToolSpec } from '../ai-tools/hub-tool';
import { CALL_TOOL_INPUT } from '../ai-tools/tool-discovery';
import { chatSet, META_TOOLS, META_TOOL_NAMES } from '../ai-tools/tool-sets';
import { harnessToolSchema } from './tool-schema';

export function centralToolSpecs(hub: ToolHub): readonly ToolSpec[] {
  return [
    ...hub.list().filter((tool) => tool.name !== 'ask_user_question'),
    ...META_TOOLS.filter((tool) => tool.name === META_TOOL_NAMES.call),
  ];
}

function readOnlyNames(hub: ToolHub): readonly string[] {
  return hub
    .list()
    .filter((tool) => tool.annotations.readOnlyHint)
    .map((tool) => tool.name);
}

export function centralToolCatalogue(hub: ToolHub): z.infer<typeof HARNESS_CENTRAL_CATALOGUE> {
  const readOnlyTools = new Set(readOnlyNames(hub));
  return HARNESS_CENTRAL_CATALOGUE.parse(
    centralToolSpecs(hub).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: harnessToolSchema(tool.inputSchema),
      read_only: tool.name !== META_TOOL_NAMES.call && readOnlyTools.has(tool.name),
      ...(tool.name === META_TOOL_NAMES.call ? { read_only_targets: [...readOnlyTools] } : {}),
    })),
  );
}

export function centralToolDeclarationNames(hub: ToolHub): readonly string[] {
  return chatSet(hub.list())
    .filter((tool) => tool.name !== 'ask_user_question')
    .map((tool) => tool.name);
}

function readOnly(hub: ToolHub, name: string): boolean {
  return hub.list().some((tool) => tool.name === name && tool.annotations.readOnlyHint);
}

function classified(hub: ToolHub, tool: string, args: Readonly<Record<string, unknown>>): boolean {
  if (tool !== META_TOOL_NAMES.call) return readOnly(hub, tool);
  const target = CALL_TOOL_INPUT.safeParse(args);
  return target.success && readOnly(hub, target.data.name);
}

export function centralHomeTools(hub: ToolHub): readonly HomeTool[] {
  return centralToolSpecs(hub).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: harnessToolSchema(tool.inputSchema),
    concurrencySafe: (args) => classified(hub, tool.name, args),
  }));
}
