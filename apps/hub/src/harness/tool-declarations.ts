import { HARNESS_CENTRAL_CATALOGUE } from '@smarteverything/domain';
import type { z } from 'zod';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { ToolSpec } from '../ai-tools/hub-tool';
import { chatSet, META_TOOLS, META_TOOL_NAMES } from '../ai-tools/tool-sets';
import { harnessToolSchema } from './tool-schema';

export function centralToolSpecs(hub: ToolHub): readonly ToolSpec[] {
  return [
    ...hub.list().filter((tool) => tool.name !== 'ask_user_question'),
    ...META_TOOLS.filter((tool) => tool.name === META_TOOL_NAMES.call),
  ];
}

export function centralToolCatalogue(hub: ToolHub): z.infer<typeof HARNESS_CENTRAL_CATALOGUE> {
  return HARNESS_CENTRAL_CATALOGUE.parse(
    centralToolSpecs(hub).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: harnessToolSchema(tool.inputSchema),
    })),
  );
}

export function centralToolDeclarationNames(hub: ToolHub): readonly string[] {
  return chatSet(hub.list())
    .filter((tool) => tool.name !== 'ask_user_question')
    .map((tool) => tool.name);
}
