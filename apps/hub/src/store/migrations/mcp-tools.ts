import { COLUMN_TYPES } from './core-tables';

export const MCP_TOOL_SWITCHES: readonly string[] = [
  `alter table settings add column ${COLUMN_TYPES.JSON_ARRAY('mcp_disabled_tools')}`,
];
