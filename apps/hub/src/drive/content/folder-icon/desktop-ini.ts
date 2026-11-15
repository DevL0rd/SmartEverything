import { iniEntries } from './ini';

const SHELL_CLASS = '.shellclassinfo';

const INDEX = /^-?\d+$/u;

function withoutIndex(value: string): string {
  const comma = value.lastIndexOf(',');
  return comma >= 0 && INDEX.test(value.slice(comma + 1).trim())
    ? value.slice(0, comma).trim()
    : value;
}

function unquoted(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

export function desktopIniIcon(text: string): string | null {
  const shell = iniEntries(text)
    .filter((entry) => entry.section === SHELL_CLASS)
    .map((entry) => ({ key: entry.key.toLowerCase(), value: unquoted(entry.value) }))
    .filter((entry) => entry.value !== '');
  const resource = shell.find((entry) => entry.key === 'iconresource');
  if (resource !== undefined) return withoutIndex(resource.value);
  return shell.find((entry) => entry.key === 'iconfile')?.value ?? null;
}
