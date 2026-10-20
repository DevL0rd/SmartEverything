import {
  BOARD_CLASSES,
  BOARD_LAYOUT_VERSION,
  type BoardArrangement,
  type BoardClass,
  type BoardLayout,
  type BoardSnapshot,
  type BoardWidget,
} from './board-layout';

export type BoardDefaultWidgets = Readonly<Record<BoardClass, readonly BoardWidget[]>>;

export type ArrangementSource = 'own' | 'following' | 'default';

type Follow = NonNullable<BoardLayout['follow']>;

function layoutOf(parts: BoardSnapshot, previous?: BoardSnapshot): BoardLayout {
  const { follow, added } = parts;
  return {
    version: BOARD_LAYOUT_VERSION,
    classes: parts.classes,
    ...(follow === undefined || Object.keys(follow).length === 0 ? {} : { follow }),
    ...(added === undefined || Object.keys(added).length === 0 ? {} : { added }),
    ...(previous === undefined ? {} : { previous }),
  };
}

function snapshotOf(layout: BoardLayout): BoardSnapshot {
  return {
    classes: layout.classes,
    ...(layout.follow === undefined ? {} : { follow: layout.follow }),
    ...(layout.added === undefined ? {} : { added: layout.added }),
  };
}

function withoutFollow(follow: BoardLayout['follow'], board: BoardClass): Follow {
  const kept: Follow = {};
  for (const other of BOARD_CLASSES) {
    const target = follow?.[other];
    if (other !== board && target !== undefined) {
      kept[other] = target;
    }
  }
  return kept;
}

function withoutAdded(layout: BoardLayout, board: BoardClass): BoardLayout['classes'] {
  return withoutClasses(layout.added ?? {}, board);
}

function withoutClasses(
  classes: BoardLayout['classes'],
  board: BoardClass,
): BoardLayout['classes'] {
  const kept: BoardLayout['classes'] = {};
  for (const other of BOARD_CLASSES) {
    const arrangement = classes[other];
    if (other !== board && arrangement !== undefined) {
      kept[other] = arrangement;
    }
  }
  return kept;
}

export function arrangementSourceOf(
  layout: BoardLayout | null,
  board: BoardClass,
): ArrangementSource {
  if (layout?.classes[board] !== undefined) {
    return 'own';
  }
  return layout?.follow?.[board] === undefined ? 'default' : 'following';
}

function defaultsWithAdded(
  layout: BoardLayout | null,
  board: BoardClass,
  defaults: BoardDefaultWidgets,
): readonly BoardWidget[] {
  const extra = layout?.added?.[board]?.widgets ?? [];
  const base = defaults[board];
  const fresh = extra.filter((widget) => !base.some((other) => other.key === widget.key));
  return fresh.length === 0 ? base : [...base, ...fresh];
}

export function arrangementOf(
  layout: BoardLayout | null,
  board: BoardClass,
  defaults: BoardDefaultWidgets,
): readonly BoardWidget[] {
  const own = layout?.classes[board];
  if (own !== undefined) {
    return own.widgets;
  }
  const target = layout?.follow?.[board];
  if (layout === null || target === undefined) {
    return defaultsWithAdded(layout, board, defaults);
  }
  return layout.classes[target]?.widgets ?? defaultsWithAdded(layout, target, defaults);
}

export function withWidgetOverlaid(
  layout: BoardLayout,
  board: BoardClass,
  widget: BoardWidget,
): BoardLayout {
  const own = layout.classes[board];
  if (own !== undefined) {
    return withArrangementFor(layout, board, { widgets: [...own.widgets, widget] });
  }
  if (layout.follow?.[board] !== undefined) {
    return layout;
  }
  const current = layout.added?.[board]?.widgets ?? [];
  return layoutOf({
    classes: layout.classes,
    follow: layout.follow,
    added: { ...layout.added, [board]: { widgets: [...current, widget] } },
  });
}

export function withArrangementFor(
  layout: BoardLayout,
  board: BoardClass,
  arrangement: BoardArrangement,
): BoardLayout {
  return layoutOf({
    classes: { ...layout.classes, [board]: arrangement },
    follow: withoutFollow(layout.follow, board),
    added: withoutAdded(layout, board),
  });
}

export function withoutArrangementFor(layout: BoardLayout, board: BoardClass): BoardLayout {
  return layoutOf({
    classes: withoutClasses(layout.classes, board),
    follow: layout.follow,
    added: withoutAdded(layout, board),
  });
}

export function withCopiedArrangement(
  layout: BoardLayout,
  from: BoardClass,
  to: BoardClass,
  defaults: BoardDefaultWidgets,
): BoardLayout {
  const widgets = [...arrangementOf(layout, from, defaults)];
  return layoutOf(
    {
      classes: { ...layout.classes, [to]: { widgets } },
      follow: withoutFollow(layout.follow, to),
      added: withoutAdded(layout, to),
    },
    snapshotOf(layout),
  );
}

export function withDefaultArrangement(layout: BoardLayout, board: BoardClass): BoardLayout {
  return layoutOf(
    {
      classes: withoutClasses(layout.classes, board),
      follow: withoutFollow(layout.follow, board),
      added: withoutAdded(layout, board),
    },
    snapshotOf(layout),
  );
}

export function withFollowing(
  layout: BoardLayout,
  board: BoardClass,
  target: BoardClass | null,
): BoardLayout {
  if (layout.classes[board] !== undefined || target === board) {
    return layout;
  }
  const rest = withoutFollow(layout.follow, board);
  return layoutOf({
    classes: layout.classes,
    follow: target === null ? rest : { ...rest, [board]: target },
    added: layout.added,
  });
}

export function withUndone(layout: BoardLayout): BoardLayout {
  return layout.previous === undefined ? layout : layoutOf(layout.previous);
}
