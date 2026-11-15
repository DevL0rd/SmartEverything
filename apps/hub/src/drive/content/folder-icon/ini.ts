const SECTION = /^\s*\[([^\]]*)\]\s*$/u;

export interface IniEntry {
  readonly section: string;
  readonly key: string;
  readonly value: string;
}

export function iniEntries(text: string): readonly IniEntry[] {
  const entries: IniEntry[] = [];
  let section = '';
  for (const line of text.split(/\r?\n/u)) {
    const heading = SECTION.exec(line)?.[1];
    if (heading !== undefined) {
      section = heading.trim().toLowerCase();
      continue;
    }
    const equals = line.indexOf('=');
    if (equals > 0) {
      entries.push({
        section,
        key: line.slice(0, equals).trim(),
        value: line.slice(equals + 1).trim(),
      });
    }
  }
  return entries;
}
