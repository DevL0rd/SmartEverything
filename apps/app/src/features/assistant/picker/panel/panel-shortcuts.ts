import type { Engine } from '@smarteverything/domain';
import { useKeyboard, type KeyPress } from '../../../../app-shell/shortcuts';
import { useInsideOverlay } from '../../../../components/overlay-shown';
import { useScreenPaused } from '../../../../design/screen-pause';
import {
  appliedEffort,
  cycleEffort,
  effortOverride,
  useEngineThinking,
} from '../../chats/engine-efforts';

export interface ChipShortcuts {
  readonly engine: Engine;
  readonly editable: boolean;
  readonly onChange: (engine: Engine) => void;
  readonly toggle: () => void;
}

export function useChipShortcuts({ engine, editable, onChange, toggle }: ChipShortcuts): void {
  const thinking = useEngineThinking(engine);
  const efforts = thinking.efforts.map((effort) => effort.id);
  const paused = useScreenPaused();
  const overlaid = useInsideOverlay();
  useKeyboard((press: KeyPress): boolean => {
    if (paused || !press.command || press.alt) return false;
    if (!press.shift) {
      if (press.key !== '.') return false;
      toggle();
      return true;
    }
    if (press.key.toLowerCase() !== 'e' || efforts.length === 0) return false;
    if (editable) {
      const current = appliedEffort(thinking, engine.effort);
      const next = cycleEffort(efforts, current, 1, true);
      if (next !== current) onChange({ ...engine, effort: effortOverride(thinking, next) });
    }
    return true;
  }, overlaid);
}
