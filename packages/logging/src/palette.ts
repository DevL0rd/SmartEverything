const ESCAPE = '\u001B';

export const RESET = `${ESCAPE}[0m`;
export const BOLD = `${ESCAPE}[1m`;

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

export const BACKGROUND = {
  black: `${ESCAPE}[40m`,
  red: `${ESCAPE}[41m`,
  green: `${ESCAPE}[42m`,
  yellow: `${ESCAPE}[43m`,
  blue: `${ESCAPE}[44m`,
  magenta: `${ESCAPE}[45m`,
  cyan: `${ESCAPE}[46m`,
  white: `${ESCAPE}[47m`,
  grey: `${ESCAPE}[100m`,
} as const;

export type Colour = keyof typeof FOREGROUND;

const CONTROL_SEQUENCE = new RegExp(`${ESCAPE}\\[\\d+m`, 'g');

export function withoutColour(text: string): string {
  return text.replace(CONTROL_SEQUENCE, '');
}

export function paint(text: string, colour: Colour): string {
  return `${FOREGROUND[colour]}${text}${RESET}`;
}
