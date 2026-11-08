import {
  PLUGIN_ID,
  type JsonValue,
  type PluginId,
  type PluginOption,
  type PluginOptionPage,
} from '@smarteverything/domain';
import { PLUGIN_PREFIX } from '../../../../../queries/keys';
import type { PickerOption } from './option-picker-model';

export interface EntityRef {
  readonly pluginId: PluginId;
  readonly entity: string;
}

export const NO_PLUGIN_REASON = 'This list does not name a plugin it comes from.';
export const MISSING_ENTITY = 'No longer listed';

export function entityRefOf(of: string): EntityRef | null {
  const dot = of.indexOf('.');
  if (dot <= 0) return null;
  const plugin = PLUGIN_ID.safeParse(of.slice(0, dot));
  const entity = of.slice(dot + 1);
  if (!plugin.success || entity === '') return null;
  return { pluginId: plugin.data, entity };
}

export function entityKey(ref: EntityRef, rest: readonly string[]): readonly string[] {
  return [...PLUGIN_PREFIX, ref.pluginId, 'entities', ref.entity, ...rest];
}

export function heldEntity(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export type ChosenView =
  | { readonly state: 'none' }
  | { readonly state: 'loading'; readonly id: string }
  | { readonly state: 'found'; readonly option: PluginOption }
  | { readonly state: 'missing'; readonly id: string }
  | { readonly state: 'unavailable'; readonly id: string; readonly message: string };

export function chosenViewOf(
  id: string | null,
  page: PluginOptionPage | undefined,
  picked: PluginOption | null,
): ChosenView {
  if (id === null) return { state: 'none' };
  if (picked?.id === id) return { state: 'found', option: picked };
  if (page === undefined) return { state: 'loading', id };
  if (page.state === 'unavailable') return { state: 'unavailable', id, message: page.message };
  const option = page.options.find((entry) => entry.id === id);
  return option === undefined ? { state: 'missing', id } : { state: 'found', option };
}

export function chosenNote(view: ChosenView): string | null {
  if (view.state === 'missing') return MISSING_ENTITY;
  if (view.state === 'unavailable') return view.message;
  return view.state === 'found' ? view.option.detail : null;
}

export function pickerOptionOf(option: PluginOption): PickerOption {
  return {
    id: option.id,
    label: option.label,
    ...(option.detail === null ? {} : { detail: option.detail }),
  };
}

function chosenRow(view: ChosenView): PickerOption | null {
  switch (view.state) {
    case 'none':
      return null;
    case 'found':
      return pickerOptionOf(view.option);
    case 'loading':
      return { id: view.id, label: view.id };
    case 'missing':
      return { id: view.id, label: view.id, unavailable: MISSING_ENTITY };
    case 'unavailable':
      return { id: view.id, label: view.id, unavailable: view.message };
  }
}

export function entityChoices(
  listed: readonly PluginOption[],
  view: ChosenView,
): readonly PickerOption[] {
  const rows = listed.map(pickerOptionOf);
  const chosen = chosenRow(view);
  if (chosen === null || rows.some((row) => row.id === chosen.id)) return rows;
  return [...rows, chosen];
}
