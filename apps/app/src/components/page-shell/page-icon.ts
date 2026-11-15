import { createContext } from 'react';
import type { IconName } from '../icon';
import type { ShellSections } from './shell-sections';

export const PageIconContext = createContext<IconName | null>(null);

export function activeSectionIcon(sections: ShellSections | undefined): IconName | null {
  if (sections === undefined) return null;
  const entry = sections.groups
    .flatMap((group) => group.entries)
    .find((candidate) => candidate.id === sections.active);
  return entry === undefined ? null : entry.icon;
}
