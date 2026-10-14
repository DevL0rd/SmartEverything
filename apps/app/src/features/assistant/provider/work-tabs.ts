export const WORK_TABS = [
  { value: 'overview', label: 'Commands, agents and tools' },
  { value: 'events', label: 'Native activity and usage' },
  { value: 'mcp', label: 'Manage native MCP servers' },
  { value: 'prompts', label: 'Permissions and questions' },
  { value: 'settings', label: 'Session and provider settings' },
  { value: 'control', label: 'Control native work' },
  { value: 'read', label: 'Context, usage, tasks and files' },
] as const;
export type WorkTab = (typeof WORK_TABS)[number]['value'];
