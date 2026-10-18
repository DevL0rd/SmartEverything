import type { Engine } from '@smarteverything/domain';
import { useKeyboard, type KeyPress } from '../../../../app-shell/shortcuts';
import { useInsideOverlay } from '../../../../components/overlay-shown';
import { useScreenPaused } from '../../../../design/screen-pause';
import { cycleEffort, useEngineEfforts } from '../../chats/engine-efforts';

export interface ChipShortcuts {
  readonly engine: Engine;
  readonly editable: boolean;
  readonly onChange: (engine: Engine) => void;
  readonly toggle: () => void;
}

export function useChipShortcuts({ engine, editable, onChange, toggle }: ChipShortcuts): void {
  const efforts = useEngineEfforts(engine);
  const paused = useScreenPaused();
  const overlaid = useInsideOverlay();
  useKeyboard((press: KeyPress): boolean => {
    if (paused || !press.command || press.alt) return false;
    if (!press.shift && press.key === '.') {
      toggle();
      return true;
    }
    if (!press.shift || press.key.toLowerCase() !== 'e' || efforts.length === 0) return false;
    if (editable) onChange({ ...engine, effort: cycleEffort(efforts, engine.effort, 1, true) });
    return true;
  }, overlaid);
}
