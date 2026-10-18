import { MCP_TOOL_LINES, type McpToolName, type McpToolSummary } from '@smarteverything/domain';

export function toolLine(tool: McpToolSummary<McpToolName>): string {
  return MCP_TOOL_LINES[tool.name];
}
