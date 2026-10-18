import { router } from 'expo-router';
import { ValueStore } from '../design/external-store';
import type { NavKind } from '../design/size-class';
import { href } from './hrefs';

export const navEditing = new ValueStore(false);

export type NavEditor =
  | { readonly kind: 'rename'; readonly key: string }
  | { readonly kind: 'icon'; readonly key: string }
  | { readonly kind: 'folder' }
  | { readonly kind: 'picker' };

export const navEditor = new ValueStore<NavEditor | null>(null);

export function startNavEdit(nav: NavKind): void {
  if (nav === 'rail') {
    router.navigate(href.settings.page('appearance/navigation'));
    return;
  }
  navEditing.set(true);
}

export function stopNavEdit(): void {
  navEditing.set(false);
  navEditor.set(null);
}
