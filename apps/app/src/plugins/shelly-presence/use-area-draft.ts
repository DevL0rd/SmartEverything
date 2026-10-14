import { useState } from 'react';
import { SHELLY_AREA, type ShellyArea } from '@smarteverything/domain';

export type AreaDraft = readonly (readonly string[])[];
export interface AreaControls {
  readonly value: AreaDraft;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly set: (value: AreaDraft) => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

function acceptedArea(draft: AreaDraft): ShellyArea | null {
  if (draft.some((segment) => segment.some((part) => part.trim() === ''))) return null;
  const parsed = SHELLY_AREA.safeParse(draft.map((segment) => segment.map(Number)));
  return parsed.success ? parsed.data : null;
}

export function useAreaDraft(
  initial: ShellyArea,
  change: (value: ShellyArea) => void,
  validity: (valid: boolean) => void,
): AreaControls {
  const [value, setValue] = useState<AreaDraft>(initial.map((segment) => segment.map(String)));
  const [past, setPast] = useState<readonly AreaDraft[]>([]);
  const [future, setFuture] = useState<readonly AreaDraft[]>([]);
  const publish = (next: AreaDraft): void => {
    setValue(next);
    const accepted = acceptedArea(next);
    validity(accepted !== null);
    if (accepted !== null) change(accepted);
  };
  return {
    value,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    set: (next): void => {
      setPast([...past, value]);
      setFuture([]);
      publish(next);
    },
    undo: (): void => {
      const previous = past.at(-1);
      if (previous === undefined) return;
      setFuture([...future, value]);
      setPast(past.slice(0, -1));
      publish(previous);
    },
    redo: (): void => {
      const next = future.at(-1);
      if (next === undefined) return;
      setPast([...past, value]);
      setFuture(future.slice(0, -1));
      publish(next);
    },
  };
}
