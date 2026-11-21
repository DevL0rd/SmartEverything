import { isMcpToolName } from '@smarteverything/domain';
import { builtTools, routeOf } from './built-tools';
import { outcomeOf } from './outcome';
import type { Tool, ToolOutput } from './registry';
import { partCall, type PartCall } from './served';
import { GENERATED_TOOL_SCHEMAS, withGeneratedSchemas } from './tool-schemas';

export const TOOLS: readonly Tool[] = withGeneratedSchemas(
  builtTools(() => TOOLS),
  GENERATED_TOOL_SCHEMAS,
);

const BY_NAME: ReadonlyMap<string, Tool> = new Map(TOOLS.map((tool) => [tool.name, tool]));

export function toolNamed(name: string): Tool | undefined {
  return BY_NAME.get(name);
}

export function partCallOf(name: string, args: Readonly<Record<string, unknown>>): PartCall {
  return isMcpToolName(name) ? partCall(routeOf(name), name, args) : { name, args };
}

export function shownOutput(
  name: string,
  args: Readonly<Record<string, unknown>>,
  output: ToolOutput,
): ToolOutput {
  if (output.action !== true || output.images !== undefined) return output;
  return { structured: outcomeOf(partCallOf(name, args).name, output.structured) };
}
