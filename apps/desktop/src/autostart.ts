export const AUTOSTART_FILE = 'smarteverything.desktop';

const RESERVED_CHARACTERS = /[\s"'\\><~|&;$*?#()`]/u;
const ESCAPED_IN_QUOTES = /["`$\\]/gu;

export class AutostartArgumentError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(
      `an autostart command argument must be a single line without a NUL; received ${JSON.stringify(received)}`,
    );
    this.name = 'AutostartArgumentError';
    this.received = received;
  }
}

export function quoteExecArgument(argument: string): string {
  if (/[\n\r\0]/u.test(argument)) {
    throw new AutostartArgumentError(argument);
  }
  if (argument !== '' && !RESERVED_CHARACTERS.test(argument)) {
    return argument;
  }
  return `"${argument.replace(ESCAPED_IN_QUOTES, '\\$&')}"`;
}

export function execLine(command: readonly string[]): string {
  return command.map(quoteExecArgument).join(' ').replaceAll('\\', '\\\\').replaceAll('%', '%%');
}

export function autostartEntry(name: string, command: readonly string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${name}`,
    `Exec=${execLine(command)}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}
