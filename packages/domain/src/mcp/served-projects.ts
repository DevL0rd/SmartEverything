import type { Served } from './served-types';

export const SERVED_PROJECTS = [
  [
    'search_chat_references',
    'assistant',
    'read',
    'Search chat references',
    'Finds the files, folders, skills, plugins and earlier chats a chat can refer to, without opening them.',
    { part: 'search_chat_references' },
  ],
  [
    'read_project_files',
    'assistant',
    'read',
    'Read project files',
    'Reads, lists or searches the files in this chat’s project folder on the hub.',
    { part: 'read_project_files' },
  ],
  [
    'edit_project_files',
    'assistant',
    'control',
    'Edit project files',
    'Creates, edits, moves or removes files in this chat’s project folder on the hub; it never runs commands.',
    {
      key: 'action',
      parts: { write: 'write_project_files', remove: 'remove_project_files' },
      says: {
        write: 'Create, write, edit or move files, using the version you last read',
        remove: 'Remove a file or folder',
      },
    },
  ],
] as const satisfies readonly Served[];
