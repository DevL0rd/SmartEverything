import type { SessionApp } from '@smarteverything/domain';
import type { DesktopEntries } from './desktop-entries';

export function windowApp(
  entries: DesktopEntries,
  desktopFile: string,
  resourceClass: string,
): SessionApp {
  const entry = desktopFile === '' ? undefined : entries.find(desktopFile);
  return {
    id: desktopFile === '' ? resourceClass : desktopFile,
    name: entry?.name ?? resourceClass,
  };
}
