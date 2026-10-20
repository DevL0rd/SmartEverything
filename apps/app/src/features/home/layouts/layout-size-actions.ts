import {
  BOARD_LAYOUT_VERSION,
  withCopiedArrangement,
  withDefaultArrangement,
  withFollowing,
  withUndone,
  type BoardClass,
  type BoardDefaultWidgets,
  type BoardLayout,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { copyConfirmBody, resetConfirmBody, BOARD_LABELS } from '../model/layout-sizes';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';

const log = new Logger('app.home');

export interface LayoutSizeContext {
  readonly layout: BoardLayout | null;
  readonly defaults: BoardDefaultWidgets;
  readonly save: (layout: BoardLayout) => void;
}

const EMPTY: BoardLayout = { version: BOARD_LAYOUT_VERSION, classes: {} };

export async function copyLayoutSize(
  context: LayoutSizeContext,
  from: BoardClass,
  to: BoardClass,
): Promise<void> {
  const before = context.layout ?? EMPTY;
  const accepted = await confirm({
    title: `Copy ${BOARD_LABELS[from]} to ${BOARD_LABELS[to]}?`,
    body: copyConfirmBody(from, to, before.classes[to] !== undefined),
    confirmLabel: 'Copy layout',
    tone: 'destructive',
  });
  if (!accepted) return;
  log.info('home.layouts.copied', { from, to });
  context.save(withCopiedArrangement(before, from, to, context.defaults));
  notify({
    message: `${BOARD_LABELS[to]} now matches ${BOARD_LABELS[from]}`,
    undo: () => {
      context.save(before);
    },
  });
}

export async function resetLayoutSize(
  context: LayoutSizeContext,
  board: BoardClass,
): Promise<void> {
  const before = context.layout ?? EMPTY;
  const accepted = await confirm({
    title: `Reset ${BOARD_LABELS[board]} to the default?`,
    body: resetConfirmBody(board),
    confirmLabel: 'Reset layout',
    tone: 'destructive',
  });
  if (!accepted) return;
  log.info('home.layouts.reset', { board });
  context.save(withDefaultArrangement(before, board));
  notify({
    message: `${BOARD_LABELS[board]} is back to the default`,
    undo: () => {
      context.save(before);
    },
  });
}

export function followLayoutSize(
  context: LayoutSizeContext,
  board: BoardClass,
  target: BoardClass | null,
): void {
  log.info('home.layouts.follow_changed', { board, target });
  context.save(withFollowing(context.layout ?? EMPTY, board, target));
}

export function undoLayoutChange(context: LayoutSizeContext): void {
  if (context.layout === null) return;
  log.info('home.layouts.undone');
  context.save(withUndone(context.layout));
}
