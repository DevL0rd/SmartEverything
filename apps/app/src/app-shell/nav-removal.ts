import type { NavSection } from '@smarteverything/domain';
import type { IconName } from '../components/icon';
import type { MenuItem } from '../components/menu-rows';
import type { NavEdits } from './nav-edit-actions';
import type { NavNodeView } from './nav-model';

export type NavRemoval =
  | { readonly kind: 'ungroup' }
  | { readonly kind: 'unpin' }
  | { readonly kind: 'hide'; readonly section: Exclude<NavSection, 'assistant'> };

export type NavRemovalEdits = Pick<NavEdits, 'ungroup' | 'remove' | 'hide'>;

export const REMOVAL_FACE: Readonly<
  Record<NavRemoval['kind'], { readonly icon: IconName; readonly verb: string }>
> = {
  ungroup: { icon: 'layers', verb: 'Ungroup' },
  unpin: { icon: 'close', verb: 'Unpin' },
  hide: { icon: 'eyeOff', verb: 'Hide' },
};

export function removalOf(node: NavNodeView): NavRemoval | null {
  if (node.kind === 'folder') return { kind: 'ungroup' };
  if (node.kind === 'pin') return { kind: 'unpin' };
  const section = node.node?.section;
  return section === undefined || section === 'assistant' ? null : { kind: 'hide', section };
}

export function removeNavNode(removal: NavRemoval, key: string, edits: NavRemovalEdits): void {
  switch (removal.kind) {
    case 'ungroup':
      edits.ungroup(key, true);
      return;
    case 'unpin':
      edits.remove(key);
      return;
    case 'hide':
      edits.hide(removal.section);
  }
}

export function removalMenuItem(
  removal: NavRemoval,
  key: string,
  edits: NavRemovalEdits,
): MenuItem {
  const { icon, verb } = REMOVAL_FACE[removal.kind];
  return {
    label: verb,
    icon,
    ...(removal.kind === 'unpin' ? { destructive: true } : {}),
    onPress: (): void => {
      removeNavNode(removal, key, edits);
    },
  };
}
