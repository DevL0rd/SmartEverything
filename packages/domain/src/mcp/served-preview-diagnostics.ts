import type { Served } from './served-types';
export const SERVED_PREVIEW_DIAGNOSTICS = [
  [
    'read_embedded_browser',
    'assistant',
    'read',
    'Read embedded browser tabs',
    'Read tabs and capabilities from the initiating connected SmartEverything viewer in this chat. Choose an explicit viewer when ambiguous. No polling, headless browser or operating-system control.',
    { part: 'read_embedded_browser' },
  ],
  [
    'edit_embedded_browser',
    'assistant',
    'control',
    'Edit embedded browser tabs',
    'Open a public HTTPS site or an existing authorized preview publication, select, navigate, reload, close or reorder tabs on an exact connected SmartEverything viewer. Read its generation first and retain a unique request ID; unknown delivery must be reconciled through a fresh read, never replayed.',
    { part: 'edit_embedded_browser' },
  ],

  [
    'clear_preview_data',
    'assistant',
    'control',
    'Clear preview website data',
    'Clear only the selected preview browser cache or cookies on its viewing device. Never changes app or AI credentials; unsupported platforms refuse.',
    { part: 'clear_preview_data' },
  ],
  [
    'read_preview_logs',
    'assistant',
    'read',
    'Read preview logs',
    'Read bounded untrusted console text from the current viewing device with stable cursor and snapshot. Never poll.',
    { part: 'read_preview_logs' },
  ],
  [
    'search_preview_logs',
    'assistant',
    'read',
    'Search preview logs',
    'Search literal preview console messages, source and stack with level/time/ID filters and bounded context. Never poll.',
    { part: 'search_preview_logs' },
  ],
  [
    'capture_preview_viewport',
    'assistant',
    'read',
    'Capture preview viewport',
    'Capture the actual visible preview viewport on the initiating viewer device. Refuses hidden, inactive or stale views; different from headless or working computer screenshots.',
    { part: 'capture_preview_viewport' },
  ],
] as const satisfies readonly Served[];
