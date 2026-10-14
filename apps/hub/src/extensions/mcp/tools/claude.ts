import { operationTool } from './operation-tools';
import type { Tool } from './registry';

export const CLAUDE_TOOLS: readonly Tool[] = [
  operationTool('control_claude_session', 'controlClaudeCliSession'),
];
