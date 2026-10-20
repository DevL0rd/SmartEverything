import type { NavIcon } from '@smarteverything/domain';
import { ValueStore } from '../design/external-store';

export const FOLDER_ICON: NavIcon = 'folder';

export type NavEditor =
  | { readonly kind: 'rename'; readonly key: string }
  | { readonly kind: 'icon'; readonly key: string }
  | { readonly kind: 'folder'; readonly members: readonly string[] }
  | { readonly kind: 'picker' };

export const navEditor = new ValueStore<NavEditor | null>(null);
