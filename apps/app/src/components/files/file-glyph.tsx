import type { ReactNode } from 'react';
import { Icon } from '../icon';
import { IconWell } from '../icon-well';
import { glyphOf, type EntryKind } from './file-kind';

export interface FileGlyphProps {
  readonly kind: EntryKind;
  readonly name: string;
  readonly well?: 's' | 'm' | 'l';
}

export function FileGlyph({ kind, name, well }: FileGlyphProps): ReactNode {
  const glyph = glyphOf({ kind, name });
  const folder = kind === 'folder';
  if (well === undefined) {
    return <Icon name={glyph} size={20} tone={folder ? 'primary' : 'variant'} />;
  }
  return <IconWell icon={glyph} colour={folder ? 'primary' : 'on-surface-variant'} size={well} />;
}
