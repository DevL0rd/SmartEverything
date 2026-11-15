import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PhotoEdit, PhotoErase, PhotoRecipe, PhotoSaveMode } from '@smarteverything/domain';
import { IDENTITY_RECIPE } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { confirm } from '../../../components/confirm-store';
import { ValueStore } from '../../../design/external-store';
import { useStableCallback } from '../../../design/use-stable-callback';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { erasePhotoArea, savePhotoEdit } from './api';
import {
  canRedo,
  canUndo,
  cancelled,
  committed,
  drafted,
  historyOf,
  redone,
  shown,
  undone,
  type History,
} from './history';
import type { CanvasPatch } from './canvas-protocol';
import { refreshEdited, type PatchImages } from './queries';
import { sameRecipe, withPatch } from './recipe-ops';
import type { EditorTool } from './tools';

export interface PhotoEditor {
  readonly recipe: PhotoRecipe;
  readonly committed: PhotoRecipe;
  readonly tool: EditorTool;
  readonly compare: boolean;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saving: boolean;
  readonly erasing: boolean;
  readonly patches: readonly CanvasPatch[];
  readonly setTool: (tool: EditorTool) => void;
  readonly setCompare: (on: boolean) => void;
  readonly draft: (recipe: PhotoRecipe) => void;
  readonly commit: (recipe: PhotoRecipe) => void;
  readonly cancelDraft: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly save: (mode: PhotoSaveMode) => void;
  readonly erase: (strokes: PhotoErase['strokes'], onDone: () => void) => void;
  readonly leave: () => void;
}

export function closeEditor(itemId: string | null): void {
  if (router.canGoBack()) router.back();
  else router.replace(itemId === null ? href.photos() : href.photosItem(itemId));
}

export const editorLeave = new ValueStore<(() => void) | null>(null);

export function requestLeave(itemId: string | null): void {
  const leave = editorLeave.get();
  if (leave === null) closeEditor(itemId);
  else leave();
}

export function useLeaveHandler(leave: () => void): void {
  const stable = useStableCallback(leave);
  useEffect(() => {
    editorLeave.set(stable);
    return (): void => {
      if (editorLeave.get() === stable) editorLeave.set(null);
    };
  }, [stable]);
}

function savedNote(mode: PhotoSaveMode, itemId: string): void {
  if (mode === 'version') {
    notify({ message: 'Saved. The original stays in Drive versions.', tone: 'positive' });
    return;
  }
  notify({
    message: 'Saved as a copy',
    tone: 'positive',
    action: {
      label: 'Open',
      onPress: () => {
        router.push(href.photosItem(itemId));
      },
    },
  });
}

export function useLeave(itemId: string, dirty: boolean, kept: string): () => void {
  return (): void => {
    if (!dirty) {
      closeEditor(itemId);
      return;
    }
    confirm({
      title: 'Discard your edits?',
      body: kept,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: 'destructive',
      theme: 'dark',
    })
      .then((discard) => {
        if (discard) closeEditor(itemId);
      })
      .catch((error: unknown) => {
        notify({ message: 'The editor could not close', error, tone: 'critical' });
      });
  };
}

function useHistory(
  edit: PhotoEdit,
): readonly [History, (change: (h: History) => History) => void] {
  const [history, setHistory] = useState(() => historyOf(edit.recipe ?? IDENTITY_RECIPE));
  return [history, setHistory];
}

type Change = (change: (current: History) => History) => void;

function historyActions(
  change: Change,
): Pick<PhotoEditor, 'draft' | 'commit' | 'cancelDraft' | 'undo' | 'redo'> {
  return {
    draft: (next): void => {
      change((current) => drafted(current, next));
    },
    commit: (next): void => {
      change((current) => committed(current, next));
    },
    cancelDraft: (): void => {
      change(cancelled);
    },
    undo: (): void => {
      change(undone);
    },
    redo: (): void => {
      change(redone);
    },
  };
}

function useWrites(
  edit: PhotoEdit,
  history: History,
  change: Change,
  keep: (patchId: string, png: string) => void,
): Pick<PhotoEditor, 'saving' | 'erasing' | 'save' | 'erase'> {
  const client = useQueryClient();
  const saving = useMutationState();
  const erasing = useMutationState();
  return {
    saving: saving.busy,
    erasing: erasing.busy,
    save: (mode): void => {
      saving.run(() => savePhotoEdit(edit.itemId, { recipe: history.present, mode }), {
        failure: mode === 'version' ? 'The photo was not saved' : 'The copy was not saved',
        label: 'photo_edit',
        onDone: (saved) => {
          refreshEdited(client, edit.itemId);
          savedNote(mode, saved.itemId);
          closeEditor(edit.itemId);
        },
      });
    },
    erase: (strokes, onDone): void => {
      erasing.run(() => erasePhotoArea(edit.itemId, { strokes }), {
        failure: 'The area was not erased',
        label: 'photo_erase',
        onDone: (patch) => {
          keep(patch.patchId, patch.png);
          change((current) =>
            committed(current, withPatch(current.present, patch.patchId, patch.box)),
          );
          onDone();
        },
      });
    },
  };
}

function patchesOf(recipe: PhotoRecipe, images: PatchImages): readonly CanvasPatch[] {
  return recipe.patches.flatMap((patch) => {
    const uri = images[patch.patchId];
    return uri === undefined ? [] : [{ box: patch.box, uri }];
  });
}

export function usePhotoEditor(edit: PhotoEdit, kept: PatchImages): PhotoEditor {
  const [history, change] = useHistory(edit);
  const [images, setImages] = useState<PatchImages>(kept);
  const [tool, setTool] = useState<EditorTool>('crop');
  const [compare, setCompare] = useState(false);
  const dirty = !sameRecipe(history.present, edit.recipe ?? IDENTITY_RECIPE);
  const writes = useWrites(edit, history, change, (patchId, png) => {
    setImages((current) => ({ ...current, [patchId]: png }));
  });
  const leave = useLeave(edit.itemId, dirty, 'The photo stays as it was.');
  return {
    recipe: shown(history),
    committed: history.present,
    tool,
    compare,
    dirty,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    patches: patchesOf(shown(history), images),
    setTool: (next): void => {
      change(cancelled);
      setTool(next);
    },
    setCompare,
    ...historyActions(change),
    ...writes,
    leave,
  };
}
