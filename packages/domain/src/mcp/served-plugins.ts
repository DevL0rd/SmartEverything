import type { Served } from './served-types';

export const SERVED_PLUGINS = [
  {
    name: 'plugin_read',
    area: 'plugins',
    access: 'read',
    title: 'Read plugins',
    line: 'Status, tools, data, log and people',
    description:
      'Installed plugins with status, powers, settings and the widgets and pages they add (a board type pluginId.widgetId, a page route plugin.pluginId.pageId), or one plugin’s tools, data streams, log, or the people it lets act. Read its tools before plugin_call.',
    route: {
      key: 'view',
      branches: {
        list: { part: 'list_plugins', line: 'Installed plugins with status and settings' },
        tools: { part: 'list_plugin_tools', line: 'One plugin’s tools with their inputs' },
        data: { part: 'read_plugin_data', line: 'One plugin’s data stream' },
        log: { part: 'read_plugin_log', line: 'One plugin’s log' },
        people: {
          part: 'list_plugin_people',
          line: 'The people a plugin lets act and who they are at home',
        },
      },
    },
  },
  {
    name: 'plugin_edit',
    area: 'plugins',
    access: 'control',
    title: 'Change a plugin',
    line: 'On or off, trust, tools, settings, restart',
    description:
      'Switches a plugin on or off, trusts it, switches single tools of it, changes its settings, or restarts it; pluginId comes from plugin_read.',
    route: {
      key: 'action',
      branches: {
        update: { part: 'plugin_edit', line: 'Enabled, trusted, tool switches or settings' },
        restart: { part: 'restart_plugin', line: 'Restart the plugin' },
      },
    },
  },
  {
    name: 'plugin_call',
    area: 'plugins',
    access: 'control',
    title: 'Use a plugin tool',
    line: 'Run one tool a plugin offers',
    description:
      'Runs one tool of a switched-on plugin with its arguments; the tool names and inputs come from plugin_read view tools.',
    route: { part: 'plugin_call' },
  },
  {
    name: 'operation_call',
    area: 'everything',
    access: 'control',
    title: 'Run an API operation',
    line: 'Anything without its own tool',
    description:
      'Runs one SmartEverything API operation (a camelCase name such as listClaudeSessions) as the app does, for anything no tool covers; find it with tool_search and read its input with tool_read first. Validation and access rules apply as in the app.',
    route: { part: 'operation_call' },
  },
  {
    name: 'tool_search',
    area: 'everything',
    access: 'read',
    title: 'Search tools',
    line: 'Find the tool or operation for a job',
    description:
      'Finds tools and API operations by what you want to do, best matches first with one line each; area narrows operations to one part of the app and nextCursor pages on. Use it before saying something cannot be done.',
    route: { custom: true },
  },
  {
    name: 'tool_read',
    area: 'everything',
    access: 'read',
    title: 'Read a tool',
    line: 'The exact input of a tool or operation',
    description:
      'The full description, input schema and annotations of one tool (variant gives one action or view), of an API operation by its camelCase name, or of a shared schema such as engine. Read it before calling a tool that is not declared.',
    route: { custom: true },
  },
] as const satisfies readonly Served[];
