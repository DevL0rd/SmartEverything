export type MenuDismissal = 'user' | 'composer-panel';

export function returnsFocus(reason: MenuDismissal, open: boolean): boolean {
  return open && reason === 'user';
}
