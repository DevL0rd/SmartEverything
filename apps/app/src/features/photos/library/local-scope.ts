import { count } from '../../../format/number';
import { localIdOf } from '../local/store';
import type { LocalLibraryState, LocalMediaItem } from '../local/types';

export type DeviceView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ask' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly limited: boolean; readonly issue: string | null };

export function deviceViewOf(library: LocalLibraryState, asked: boolean): DeviceView {
  if (library.state === 'loading' && library.items.length === 0) return { kind: 'loading' };
  if (library.state === 'denied') return asked ? { kind: 'settings' } : { kind: 'ask' };
  if (library.items.length === 0 && library.error !== null) {
    return { kind: 'error', message: library.error };
  }
  if (library.items.length === 0) return { kind: 'empty' };
  return { kind: 'ready', limited: library.access === 'limited', issue: library.error };
}

export function deviceCountOf(library: LocalLibraryState): number | undefined {
  return library.state === 'ready' || library.items.length > 0 ? library.items.length : undefined;
}

export function pickedLocalItems(
  ids: ReadonlySet<string>,
  items: readonly LocalMediaItem[],
): readonly LocalMediaItem[] {
  const picked = new Set(
    [...ids].flatMap((id) => {
      const local = localIdOf({ id, local: true });
      return local === null ? [] : [local];
    }),
  );
  return items.filter((item) => picked.has(item.id));
}

export function pickedLocalText(total: number): string {
  return `${count(total)} selected on this device`;
}
