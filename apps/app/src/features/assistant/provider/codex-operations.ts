import type { ProviderOperation } from './provider-operations';
import type { z } from 'zod';
import type { CODEX_PROVIDER_CONTROL, CODEX_PROVIDER_READ_QUERY } from '@smarteverything/domain';
export interface CodexOperation extends Omit<ProviderOperation, 'id'> {
  readonly id:
    | z.output<typeof CODEX_PROVIDER_CONTROL>['action']
    | z.output<typeof CODEX_PROVIDER_READ_QUERY>['kind'];
}
export const CODEX_OPERATIONS: readonly CodexOperation[] = [
  {
    id: 'context',
    kind: 'read',
    title: 'Execution context',
    description: 'Actual computer, folder and workspace policy for this session',
    fields: [],
  },
  {
    id: 'usage',
    kind: 'read',
    title: 'Usage and plan limits',
    description: 'Reported tokens and account rate limits; absent values stay unknown',
    fields: [],
  },
  {
    id: 'tasks',
    kind: 'read',
    title: 'Tasks and agents',
    description: 'Observed child activity associated with this root session',
    fields: [],
  },
  {
    id: 'mcp_status',
    kind: 'read',
    title: 'Native MCP status',
    description: 'MCP servers exposed to this session on its computer',
    fields: [],
  },
  {
    id: 'file',
    kind: 'read',
    title: 'Read workspace file',
    description: 'Bounded read within this session’s authorized workspace roots',
    fields: [{ key: 'path', label: 'File path', kind: 'text', initial: '' }],
  },
  {
    id: 'sessions',
    kind: 'read',
    title: 'Owned sessions',
    description: 'Saved Codex sessions associated with this provider',
    fields: [],
  },
  {
    id: 'session_messages',
    kind: 'read',
    title: 'Session history',
    description: 'Published native items from an owned provider session',
    fields: [{ key: 'session_id', label: 'Session ID', kind: 'text', initial: '' }],
  },
  {
    id: 'close',
    kind: 'control',
    title: 'Close provider session',
    description: 'Close an idle provider handle; active work must stop first',
    fields: [],
  },
  {
    id: 'rename_session',
    kind: 'control',
    title: 'Rename session',
    description: 'Rename this owned native session',
    fields: [
      { key: 'session_id', label: 'Session ID', kind: 'text', initial: '' },
      { key: 'title', label: 'Title', kind: 'text', initial: '' },
    ],
  },
  {
    id: 'fork_session',
    kind: 'control',
    title: 'Fork session',
    description: 'Create a native branch of an owned session',
    fields: [{ key: 'session_id', label: 'Session ID', kind: 'text', initial: '' }],
  },
  {
    id: 'archive_session',
    kind: 'control',
    title: 'Archive session',
    description: 'Archive an owned native session',
    fields: [{ key: 'session_id', label: 'Session ID', kind: 'text', initial: '' }],
  },
  {
    id: 'unarchive_session',
    kind: 'control',
    title: 'Unarchive session',
    description: 'Restore an archived owned native session',
    fields: [{ key: 'session_id', label: 'Session ID', kind: 'text', initial: '' }],
  },
  {
    id: 'delete_session',
    kind: 'control',
    title: 'Delete session',
    description: 'Permanently delete the selected owned native session',
    fields: [{ key: 'session_id', label: 'Session ID', kind: 'text', initial: '' }],
  },
];
