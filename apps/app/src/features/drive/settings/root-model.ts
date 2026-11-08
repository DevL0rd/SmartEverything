import { z } from 'zod';
import type { DriveRoot, DriveRootChange, DriveWatcherState } from '@smarteverything/domain';
import type { ConfirmRequest } from '../../../components/confirm-store';
import type { Tone } from '../../../components/tone';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { itemsTextOf, rootStateLineOf } from '../roots/root-card-model';
import { watcherLineOf } from './watcher-line';

export type RootAccess = 'edit' | 'view';

export const ROOT_ACCESS_OPTIONS = [
  { value: 'edit', label: 'Everyone can edit' },
  { value: 'view', label: 'Everyone can view' },
] as const;

export const REMOVE_ROOT = 'Remove from library';

export const REMOVE_NOTE = 'Drive stops using this folder. The files stay on the disk.';

export const MANAGED_NOTE =
  'The hub’s own folder for uploads, kept camera clips and chat images. It is always there and cannot be removed.';

export const VIRTUAL_NOTE =
  'SmartEverything fills this folder itself, so it cannot be renamed, changed or removed.';

const ROOT_PARAMS = z.strictObject({ rootId: z.uuid() });

export function rootIdOf(route: {
  readonly rootId?: string | undefined;
  readonly page?: readonly string[] | undefined;
}): string | null {
  const parsed = ROOT_PARAMS.safeParse({ rootId: route.rootId ?? route.page?.[2] });
  return parsed.success ? parsed.data.rootId : null;
}

export interface RootAbilities {
  readonly change: boolean;
  readonly access: boolean;
  readonly remove: boolean;
  readonly placements: boolean;
}

export function rootAbilitiesOf(root: DriveRoot, editable: boolean): RootAbilities {
  const physical = root.path !== null;
  const change = editable && physical;
  return {
    change,
    access: change && root.kind !== 'managed',
    remove: change && root.kind !== 'managed',
    placements: physical,
  };
}

export function rootAccessOf(root: DriveRoot): RootAccess {
  return root.readOnly ? 'view' : 'edit';
}

export function accessChangeOf(access: RootAccess): DriveRootChange {
  return access === 'view' ? { readOnly: true, versions: false } : { readOnly: false };
}

export function whoSeesOf(root: DriveRoot): string {
  return root.scope === 'home' ? 'Everyone in the home' : 'Only the person it belongs to';
}

export function accessNoteOf(root: DriveRoot): string {
  if (root.kind === 'managed') return 'The hub’s own folder is always open for changes.';
  return root.readOnly
    ? 'Nobody changes files here through SmartEverything.'
    : 'People in the home add, change and delete files here.';
}

export function rootSubtitleOf(root: DriveRoot): string {
  return joinParts([root.path, bytes(root.bytes), itemsTextOf(root.items)]);
}

export function syncValueOf(root: DriveRoot): string {
  return root.synced ? 'On' : 'Off';
}

export interface RootWatchLine {
  readonly text: string;
  readonly tone: Tone;
}

export function rootWatchLineOf(
  root: DriveRoot,
  watcher: DriveWatcherState | undefined,
): RootWatchLine {
  const state = rootStateLineOf(root);
  if (root.state !== 'ready' || watcher === undefined || watcher === 'watching') {
    return { text: joinParts([itemsTextOf(root.items), state.text]), tone: state.tone };
  }
  const line = watcherLineOf(watcher);
  return { text: joinParts([itemsTextOf(root.items), line.text]), tone: line.tone };
}

export function removeRootRequestOf(root: DriveRoot): ConfirmRequest {
  return {
    title: `Remove ${root.label} from the library?`,
    body: `${REMOVE_NOTE} Its versions, links and synced copies on computers stop too.`,
    confirmLabel: REMOVE_ROOT,
    tone: 'destructive',
  };
}

export interface RemoveRootSteps {
  readonly confirm: (request: ConfirmRequest) => Promise<boolean>;
  readonly remove: (rootId: string) => Promise<unknown>;
  readonly leave: () => void;
}

export async function removeRootConfirmed(
  root: DriveRoot,
  steps: RemoveRootSteps,
): Promise<boolean> {
  const accepted = await steps.confirm(removeRootRequestOf(root));
  if (!accepted) return false;
  await steps.remove(root.id);
  steps.leave();
  return true;
}
