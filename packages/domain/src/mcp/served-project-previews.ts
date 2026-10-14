import type { Served } from './served-types';
export const SERVED_PROJECT_PREVIEWS = [
  [
    'publish_project_preview',
    'assistant',
    'control',
    'Show a central project',
    'Publish an existing managed workspace directory and HTML entry with relative CSS, JavaScript, modules, fonts, images and JSON assets. Files remain on the hub across execution-device changes and restarts. Editing relevant files updates its stable publication; no development server or arbitrary hub access.',
    { part: 'publish_project_preview' },
  ],
] as const satisfies readonly Served[];
