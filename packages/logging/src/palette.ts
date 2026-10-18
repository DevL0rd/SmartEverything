const ESCAPE = '\u001B';

export const RESET = `${ESCAPE}[0m`;

export const FOREGROUND = {
  black: `${ESCAPE}[30m`,
  red: `${ESCAPE}[31m`,
  green: `${ESCAPE}[32m`,
  yellow: `${ESCAPE}[33m`,
  blue: `${ESCAPE}[34m`,
  magenta: `${ESCAPE}[35m`,
  cyan: `${ESCAPE}[36m`,
  white: `${ESCAPE}[37m`,
  grey: `${ESCAPE}[90m`,
} as const;

export type Colour = keyof typeof FOREGROUND;
