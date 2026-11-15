import { ApiError } from '@smarteverything/domain';
import type { FileAbilities } from '../source/abilities';
import type { KindFilter, SearchState } from './filter-model';

export type BodyState =
  | { readonly kind: 'refused' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'offline' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'kindEmpty' }
  | { readonly kind: 'searching' }
  | { readonly kind: 'noMatch' }
  | { readonly kind: 'entries' };

export interface BodyInput {
  readonly abilities: FileAbilities;
  readonly loading: boolean;
  readonly error: unknown;
  readonly offline: boolean;
  readonly loaded: number;
  readonly visible: number;
  readonly filtering: boolean;
  readonly search: SearchState;
  readonly kind: KindFilter;
}

export function isPrivateError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'forbidden' || error.code === 'not_found');
}

function withoutEntries(input: BodyInput): BodyState {
  if (input.loading) return { kind: 'loading' };
  if (input.error !== null && input.error !== undefined) {
    return isPrivateError(input.error)
      ? { kind: 'denied' }
      : { kind: 'failed', error: input.error };
  }
  return input.offline ? { kind: 'offline' } : { kind: 'empty' };
}

export function bodyStateOf(input: BodyInput): BodyState {
  if (!input.abilities.list) return { kind: 'refused' };
  if (input.loaded === 0 && !input.filtering) return withoutEntries(input);
  if (input.visible > 0) return { kind: 'entries' };
  if (input.filtering) {
    return input.search === 'looking' ? { kind: 'searching' } : { kind: 'noMatch' };
  }
  return input.kind === 'all' ? { kind: 'empty' } : { kind: 'kindEmpty' };
}

export interface EmptyCopy {
  readonly title: string;
  readonly body: string;
}

export function emptyCopyOf(inTrash: boolean, writable: boolean, hiddenOnly: boolean): EmptyCopy {
  if (inTrash) {
    return {
      title: 'Trash is empty',
      body: 'Things you move to Trash wait here until you delete them for good.',
    };
  }
  if (hiddenOnly) {
    return {
      title: 'Only hidden items here',
      body: 'Show hidden items from the menu to see them.',
    };
  }
  return {
    title: 'This folder is empty',
    body: writable ? 'Upload files or drop them here.' : 'Nothing has been added here yet.',
  };
}
