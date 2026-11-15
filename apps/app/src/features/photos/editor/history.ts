import type { PhotoRecipe } from '@smarteverything/domain';
import { sameRecipe } from './recipe-ops';

export interface History {
  readonly past: readonly PhotoRecipe[];
  readonly present: PhotoRecipe;
  readonly future: readonly PhotoRecipe[];
  readonly draft: PhotoRecipe | null;
}

export function historyOf(start: PhotoRecipe): History {
  return { past: [], present: start, future: [], draft: null };
}

export function shown(history: History): PhotoRecipe {
  return history.draft ?? history.present;
}

export function drafted(history: History, recipe: PhotoRecipe): History {
  return { ...history, draft: recipe };
}

export function committed(history: History, recipe: PhotoRecipe): History {
  if (sameRecipe(recipe, history.present)) return { ...history, draft: null };
  return {
    past: [...history.past, history.present],
    present: recipe,
    future: [],
    draft: null,
  };
}

export function cancelled(history: History): History {
  return { ...history, draft: null };
}

export function undone(history: History): History {
  const previous = history.past.at(-1);
  if (previous === undefined) return cancelled(history);
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    draft: null,
  };
}

export function redone(history: History): History {
  const [next, ...rest] = history.future;
  if (next === undefined) return cancelled(history);
  return { past: [...history.past, history.present], present: next, future: rest, draft: null };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}
