import { useCallback, useState } from 'react';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { extractRegion, type Extraction } from '@smarteverything/flow/extract/extract';
import type { Refusal } from '@smarteverything/flow/extract/result';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import { useSelected } from '../../../../design/external-store';
import type { DocumentStore } from '../../model/editor/document-store';

export const PREVIEW_FUNCTION_ID = '00000000-0000-4000-8000-000000000000';
export const PREVIEW_NAME = 'New Custom Node';

export type PreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'ready'; readonly keys: readonly string[]; readonly preview: Extraction }
  | { readonly status: 'refused'; readonly keys: readonly string[]; readonly refusal: Refusal };

export const IDLE: PreviewState = { status: 'idle' };

export function keysOfIds(program: Program, ids: readonly string[]): readonly string[] {
  const index = indexProgram(program);
  return ids.flatMap((id) => {
    const entry = index.byId.get(id);
    return entry === undefined ? [] : [entry.node.key];
  });
}

export function previewExtract(
  program: Program,
  ids: readonly string[],
  ctx: CheckContext,
): PreviewState {
  const keys = keysOfIds(program, ids);
  const result = extractRegion(program, keys, ctx, {
    functionId: PREVIEW_FUNCTION_ID,
    name: PREVIEW_NAME,
  });
  return result.ok
    ? { status: 'ready', keys, preview: result }
    : { status: 'refused', keys, refusal: result };
}

export interface ExtractPreview {
  readonly state: PreviewState;
  readonly run: () => PreviewState;
  readonly reset: () => void;
}

interface Held {
  readonly selection: string;
  readonly value: PreviewState;
}

export function useExtractPreview(store: DocumentStore, ctx: CheckContext): ExtractPreview {
  const [held, setHeld] = useState<Held | null>(null);
  const selection = useSelected(store.state, (value) => value.selection.ids.join(','));
  const run = useCallback((): PreviewState => {
    const { program, selection: current } = store.state.get();
    const value = previewExtract(program, current.ids, ctx);
    setHeld({ selection: current.ids.join(','), value });
    return value;
  }, [store, ctx]);
  const reset = useCallback((): void => {
    setHeld(null);
  }, []);
  const state = held !== null && held.selection === selection ? held.value : IDLE;
  return { state, run, reset };
}
