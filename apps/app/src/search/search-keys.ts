import type { KeyPress } from '../design/keyboard';

export interface SearchKeyActions {
  readonly open: () => boolean;
  readonly runInline: () => boolean;
  readonly close: () => void;
  readonly seeAll: (() => void) | undefined;
  readonly pin: () => boolean;
  readonly step: (delta: number) => void;
  readonly right: () => boolean;
  readonly left: () => boolean;
}

function enter(press: KeyPress, settled: boolean, actions: SearchKeyActions): boolean {
  if (press.shift) {
    return false;
  }
  if (press.command) {
    if (press.alt || actions.seeAll === undefined) {
      return false;
    }
    actions.seeAll();
    return true;
  }
  return settled && (press.alt ? actions.runInline() : actions.open());
}

function move(press: KeyPress, actions: SearchKeyActions): boolean {
  if (press.command || press.alt || press.shift) {
    return false;
  }
  switch (press.key) {
    case 'ArrowDown':
      actions.step(1);
      return true;
    case 'ArrowUp':
      actions.step(-1);
      return true;
    case 'ArrowRight':
      return actions.right();
    case 'ArrowLeft':
      return actions.left();
    default:
      return false;
  }
}

export function handleSearchKey(
  press: KeyPress,
  settled: boolean,
  actions: SearchKeyActions,
): boolean {
  if (press.key === 'Escape') {
    actions.close();
    return true;
  }
  if (!press.typing) {
    return false;
  }
  switch (press.key) {
    case 'Enter':
      return enter(press, settled, actions);
    case 'p':
      return settled && press.command && !press.alt && !press.shift && actions.pin();
    default:
      return move(press, actions);
  }
}
