import type { Served } from './served-types';
export const SERVED_PROJECTS = [
  [
    'read_project_files',
    'assistant',
    'read',
    'Read central project files',
    'Read, list or search bounded real files inside the initiating chat’s central managed project. Paths stay below workspace, temporary or transfers; no arbitrary hub filesystem access.',
    { part: 'read_project_files' },
  ],
  [
    'write_project_files',
    'assistant',
    'control',
    'Edit central project files',
    'Create, atomically write, literally edit or move real central chat project files using exact observed versions and stable operation IDs. Returns actual before/after diff metadata; never runs a hub shell.',
    { part: 'write_project_files' },
  ],
  [
    'remove_project_files',
    'assistant',
    'control',
    'Remove central project files',
    'Remove an exactly guarded central chat project file or directory. Explicit device projects and arbitrary hub paths are outside this tool.',
    { part: 'remove_project_files' },
  ],
] as const satisfies readonly Served[];
