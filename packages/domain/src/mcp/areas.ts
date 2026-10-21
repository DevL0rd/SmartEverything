export type McpToolAccess = 'read' | 'control';

export const MCP_TOOL_AREAS = [
  'home',
  'devices',
  'computers',
  'control',
  'automations',
  'history',
  'health',
  'nutrition',
  'cameras',
  'talk',
  'assistant',
  'settings',
  'people',
  'plugins',
  'system',
  'everything',
] as const;

export type McpToolArea = (typeof MCP_TOOL_AREAS)[number];

export const MCP_TOOL_AREA_LABELS: Readonly<Record<McpToolArea, string>> = {
  home: 'Home & rooms',
  devices: 'Devices',
  computers: 'Computers',
  control: 'Control',
  automations: 'Automations & scenes',
  history: 'History & events',
  health: 'Health',
  nutrition: 'Food & water',
  cameras: 'Cameras',
  talk: 'Walkie-talkie',
  assistant: 'AI assistant',
  settings: 'Settings',
  people: 'People',
  plugins: 'Plugins',
  system: 'Server & access',
  everything: 'Everything else',
};

export interface McpToolSummary<N extends string = string> {
  readonly name: N;
  readonly title: string;
  readonly line: string;
  readonly description: string;
  readonly access: McpToolAccess;
  readonly area: McpToolArea;
}
