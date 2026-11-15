import { iniEntries } from './ini';

const ENTRY_SECTION = 'desktop entry';

export function directoryFileIcon(text: string): string | null {
  const icon = iniEntries(text).find(
    (entry) => entry.section === ENTRY_SECTION && entry.key === 'Icon' && entry.value !== '',
  );
  return icon?.value ?? null;
}
