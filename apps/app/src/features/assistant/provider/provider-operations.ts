import type { ProviderControl, ProviderReadQuery } from '@smarteverything/domain';

export interface OperationField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'boolean' | 'enum';
  readonly optional?: boolean;
  readonly nullable?: boolean;
  readonly options?: readonly string[];
  readonly initial?: string | number | boolean | null;
}
export interface ProviderOperation {
  readonly id: ProviderControl['action'] | ProviderReadQuery['kind'];
  readonly title: string;
  readonly description: string;
  readonly kind: 'control' | 'read';
  readonly fields: readonly OperationField[];
}
const SESSION: OperationField = { key: 'session_id', label: 'Provider session ID', kind: 'text' };
const SERVER: OperationField = { key: 'server', label: 'MCP server name', kind: 'text' };
const MESSAGE: OperationField = { key: 'message_id', label: 'Message UUID', kind: 'text' };

export const PROVIDER_OPERATIONS: readonly ProviderOperation[] = [
  {
    id: 'account_info',
    title: 'Native account information',
    description:
      'Read safe account identifiers and subscription/source categories without credentials.',
    kind: 'read',
    fields: [],
  },
  {
    id: 'seed_read_state',
    title: 'Seed file read state',
    description: 'Supply the known file modification time to the native read-state cache.',
    kind: 'control',
    fields: [
      { key: 'path', label: 'Absolute file path', kind: 'text' },
      { key: 'mtime', label: 'Modified time (milliseconds)', kind: 'number' },
    ],
  },
  {
    id: 'set_model',
    title: 'Change native model',
    description: 'Change the runtime model of this chat. The supplying computer stays the same.',
    kind: 'control',
    fields: [{ key: 'model', label: 'Native model ID', kind: 'text' }],
  },
  {
    id: 'set_permission_mode',
    title: 'Permission mode',
    description: 'Apply the mode to this provider session.',
    kind: 'control',
    fields: [
      {
        key: 'mode',
        label: 'Permission mode',
        kind: 'enum',
        options: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk'],
        initial: 'default',
      },
    ],
  },
  {
    id: 'set_thinking',
    title: 'Thinking budget and display',
    description: 'Apply the runtime’s thinking setter. Empty budget resets to runtime default.',
    kind: 'control',
    fields: [
      {
        key: 'max_tokens',
        label: 'Maximum thinking tokens',
        kind: 'number',
        nullable: true,
        initial: null,
      },
      {
        key: 'display',
        label: 'Thinking display',
        kind: 'enum',
        options: ['summarized', 'omitted'],
        nullable: true,
        initial: null,
      },
    ],
  },
  {
    id: 'cancel_message',
    title: 'Cancel a queued message',
    description: 'Cancel exactly the selected queued message, using its UUID.',
    kind: 'control',
    fields: [MESSAGE],
  },
  {
    id: 'stop_task',
    title: 'Stop a background task',
    description: 'Stop this provider session’s selected task.',
    kind: 'control',
    fields: [{ key: 'task_id', label: 'Task ID', kind: 'text' }],
  },
  {
    id: 'close',
    title: 'Close provider session',
    description: 'Release this chat’s owned runtime session and pending callbacks.',
    kind: 'control',
    fields: [],
  },
  {
    id: 'reinitialize',
    title: 'Refresh runtime initialization',
    description: 'Reload this runtime’s metadata.',
    kind: 'control',
    fields: [],
  },
  {
    id: 'reconnect_mcp',
    title: 'Reconnect an MCP server',
    description: 'Reconnect the named server in this provider session.',
    kind: 'control',
    fields: [SERVER],
  },
  {
    id: 'toggle_mcp',
    title: 'Enable or disable an MCP server',
    description: 'Change the named provider MCP server. Home tool policy still applies.',
    kind: 'control',
    fields: [SERVER, { key: 'enabled', label: 'Enabled', kind: 'boolean', initial: true }],
  },
  {
    id: 'set_mcp_permission_mode',
    title: 'MCP permission mode',
    description: 'Set the named server’s permission mode; default clears the override.',
    kind: 'control',
    fields: [
      SERVER,
      {
        key: 'mode',
        label: 'Server permission mode',
        kind: 'enum',
        options: ['default', 'auto'],
        nullable: true,
        initial: null,
      },
    ],
  },
  {
    id: 'read_mcp_resource',
    title: 'Read an MCP resource',
    description: 'Read the URI from the named provider MCP server.',
    kind: 'control',
    fields: [SERVER, { key: 'uri', label: 'Resource URI', kind: 'text' }],
  },
  {
    id: 'rename_session',
    title: 'Rename a provider session',
    description: 'Rename this chat’s owned native provider session.',
    kind: 'control',
    fields: [SESSION, { key: 'title', label: 'Title', kind: 'text' }],
  },
  {
    id: 'tag_session',
    title: 'Tag a provider session',
    description: 'Set a tag; leave it empty to clear the tag.',
    kind: 'control',
    fields: [SESSION, { key: 'tag', label: 'Tag', kind: 'text', nullable: true, initial: null }],
  },
  {
    id: 'fork_session',
    title: 'Fork a provider session',
    description:
      'Branch the native session, optionally through a message UUID. It does not undo files.',
    kind: 'control',
    fields: [
      SESSION,
      { key: 'through_message_id', label: 'Through message UUID', kind: 'text', optional: true },
    ],
  },
  {
    id: 'delete_session',
    title: 'Delete a provider session',
    description: 'Delete the selected chat-owned native provider session.',
    kind: 'control',
    fields: [SESSION],
  },
  {
    id: 'rewind_files',
    title: 'Rewind files',
    description: 'Preview checkpoint changes first. Turn preview off to apply the actual rewind.',
    kind: 'control',
    fields: [MESSAGE, { key: 'dry_run', label: 'Preview only', kind: 'boolean', initial: true }],
  },
  {
    id: 'background_tasks',
    title: 'Send work to background',
    description: 'Background all supported tasks, or name one tool-use ID.',
    kind: 'control',
    fields: [{ key: 'tool_use_id', label: 'Tool-use ID', kind: 'text', optional: true }],
  },
  {
    id: 'reload_plugins',
    title: 'Reload plugins',
    description: 'Wait to apply changes that would make the next reply slower and costlier.',
    kind: 'control',
    fields: [
      {
        key: 'hold_on_cache_impact',
        label: 'Hold on cache impact',
        kind: 'boolean',
        initial: true,
      },
    ],
  },
  {
    id: 'reload_skills',
    title: 'Reload skills',
    description: 'Reload native skills discovered on this computer.',
    kind: 'control',
    fields: [],
  },
  {
    id: 'reload_output_styles',
    title: 'Reload output styles',
    description: 'Reload native output styles from this computer.',
    kind: 'control',
    fields: [],
  },
  {
    id: 'context',
    title: 'Context usage',
    description:
      'Summary is local; full detail may invoke the runtime’s token-counting capability.',
    kind: 'read',
    fields: [
      {
        key: 'detail',
        label: 'Context detail',
        kind: 'enum',
        options: ['summary', 'full'],
        initial: 'summary',
      },
    ],
  },
  {
    id: 'usage',
    title: 'Plan and runtime usage',
    description: 'Read actual available usage. Missing or experimental usage is shown explicitly.',
    kind: 'read',
    fields: [
      { key: 'skip_behaviors', label: 'Skip usage behaviors', kind: 'boolean', initial: true },
    ],
  },
  {
    id: 'file',
    title: 'Read a file on this computer',
    description: 'Uses runtime permissions and returns file contents when allowed.',
    kind: 'read',
    fields: [
      { key: 'path', label: 'Absolute file path', kind: 'text' },
      {
        key: 'encoding',
        label: 'Encoding',
        kind: 'enum',
        options: ['utf-8', 'base64'],
        initial: 'utf-8',
      },
      { key: 'max_bytes', label: 'Maximum bytes', kind: 'number', initial: 1_048_576 },
    ],
  },
  {
    id: 'mcp_status',
    title: 'MCP connections',
    description: 'Read actual native MCP server status.',
    kind: 'read',
    fields: [],
  },
  {
    id: 'tasks',
    title: 'Background tasks',
    description: 'Read the latest runtime task snapshot.',
    kind: 'read',
    fields: [],
  },
  {
    id: 'task_output',
    title: 'Task output',
    description: 'Read the selected task’s last available output and truncation state.',
    kind: 'read',
    fields: [{ key: 'task_id', label: 'Task ID', kind: 'text' }],
  },
  {
    id: 'sessions',
    title: 'Provider sessions',
    description: 'Only sessions owned by this chat and profile are visible.',
    kind: 'read',
    fields: [{ key: 'limit', label: 'Maximum sessions', kind: 'number', initial: 100 }],
  },
  {
    id: 'session_info',
    title: 'Provider session details',
    description: 'Read the actual native session summary.',
    kind: 'read',
    fields: [SESSION],
  },
  {
    id: 'session_messages',
    title: 'Provider session messages',
    description: 'Read the native history of this chat-owned session.',
    kind: 'read',
    fields: [SESSION, { key: 'limit', label: 'Maximum messages', kind: 'number', initial: 100 }],
  },
];
