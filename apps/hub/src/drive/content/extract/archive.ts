import { closeZip, openZip, readEntryBytes, visitEntries, type Entry } from '../zip-file';
import { markupText } from './markup';

export interface PartText {
  readonly name: string;
  readonly text: string;
}

export async function readParts(
  path: string,
  wanted: (name: string) => boolean,
  textOf: (name: string, xml: string) => string,
): Promise<readonly PartText[]> {
  const zip = await openZip(path);
  try {
    const entries: Entry[] = [];
    await visitEntries(zip, (entry) => {
      if (wanted(entry.fileName)) entries.push(entry);
      return 'next';
    });
    const parts: PartText[] = [];
    for (const entry of entries.toSorted(byNaturalName)) {
      const bytes = await readEntryBytes(zip, entry);
      parts.push({ name: entry.fileName, text: textOf(entry.fileName, bytes.toString('utf8')) });
    }
    return parts;
  } finally {
    closeZip(zip);
  }
}

function byNaturalName(left: Entry, right: Entry): number {
  return left.fileName.localeCompare(right.fileName, 'en', { numeric: true });
}

export function joinedText(parts: readonly PartText[]): string {
  return parts
    .map((part) => part.text)
    .filter((text) => text !== '')
    .join('\n');
}

export function markupPart(_name: string, xml: string): string {
  return markupText(xml);
}
