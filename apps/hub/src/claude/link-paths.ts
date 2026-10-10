export const LINK_PATHS = {
  hooks: '/api/claude/hooks',
  observed: '/api/claude/hooks/observed',
  floor: '/api/claude/link/floor',
  reports: '/api/claude/link/reports',
  stream: '/api/claude/link/stream',
} as const;

export const PROMPT_HOLD_MS = 30_000;
