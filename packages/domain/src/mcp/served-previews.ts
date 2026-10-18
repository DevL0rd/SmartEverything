import type { Served } from './served-types';

export const SERVED_PREVIEWS = [
  [
    'read_previews',
    'assistant',
    'read',
    'Read shared previews',
    'Lists the pages and development servers shared with this chat and whether each can be opened.',
    { part: 'read_previews' },
  ],
  [
    'edit_previews',
    'assistant',
    'control',
    'Edit shared previews',
    'Shows a page in the app, either standalone HTML or a folder of this chat’s project files, or stops sharing one; it returns at once and the app opens the page. Also stops or resumes the automatic wake for one recurring browser error that cannot be fixed.',
    {
      key: 'action',
      parts: {
        publish_html: 'publish_html',
        publish_project: 'publish_project_preview',
        revoke: 'revoke_shared_preview',
        ignore: 'ignore_preview_error',
        restore: 'restore_preview_error',
      },
      says: {
        publish_html:
          'Show standalone HTML that carries its own CSS and scripts; give publication_id and revision to update a page',
        publish_project:
          'Show an HTML file with its CSS, scripts and images from the project folder; editing the files updates the page',
        revoke: 'Stop sharing one page or development server',
        ignore:
          'Stop waking this chat for one recurring browser error that cannot be prevented: give its console record id and a reason; fix the project first, warnings never wake, the console log stays complete',
        restore:
          'Wake this chat again for an ignored error: give the scopeKey and fingerprint listed by read_preview_logs with view ignored',
      },
    },
  ],
  [
    'read_embedded_browser',
    'assistant',
    'read',
    'Read browser tabs',
    'Reads the tabs of the browser pane open in the app and what it can do; pass a viewerId to read a specific device.',
    { part: 'read_embedded_browser' },
  ],
  [
    'edit_embedded_browser',
    'assistant',
    'control',
    'Edit browser tabs',
    'Opens a public HTTPS site or a shared preview in the app’s browser pane, or selects, navigates, reloads, closes or reorders its tabs; read the tabs first.',
    { part: 'edit_embedded_browser' },
  ],
  [
    'clear_preview_data',
    'assistant',
    'control',
    'Clear preview website data',
    'Clears the cache or cookies of one preview in the app’s browser; the sign-ins of the app and the AI are untouched.',
    { part: 'clear_preview_data' },
  ],
  [
    'read_preview_logs',
    'assistant',
    'read',
    'Read preview console',
    'Reads the browser console of a preview open in the app, the newest messages or a search through them, or lists the recurring errors ignored for wakes; read it when a page misbehaves instead of guessing.',
    {
      key: 'view',
      parts: {
        read: 'read_preview_logs',
        search: 'search_preview_logs',
        ignored: 'read_preview_error_rules',
      },
      says: {
        read: 'The newest console messages, page by page',
        search: 'Find console messages by text, level, source or time',
        ignored:
          'The recurring errors ignored for wakes in this chat, with scope, reason and sample',
      },
    },
  ],
  [
    'capture_preview_viewport',
    'assistant',
    'read',
    'Capture the preview',
    'Takes a picture of what a preview shows in the app right now; the page must be on screen.',
    { part: 'capture_preview_viewport' },
  ],
] as const satisfies readonly Served[];
