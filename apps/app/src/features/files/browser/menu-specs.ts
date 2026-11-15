import type { IconName } from '../../../components/icon';
import type { FileAbilities } from '../source/abilities';
import { nodeAllows } from '../source/ops';
import type { FileNode, SourceActionSpec } from '../source/types';

export const BUILTIN_ACTIONS = [
  'open',
  'quickLook',
  'details',
  'download',
  'rename',
  'move',
  'copy',
  'star',
  'unstar',
  'trash',
  'restore',
  'deleteNow',
] as const;

export type BuiltinAction = (typeof BUILTIN_ACTIONS)[number];

export type MenuGroup = 'open' | 'get' | 'change' | 'source' | 'danger';

export interface MenuSpec {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly shortcut: string | null;
  readonly group: MenuGroup;
  readonly destructive: boolean;
}

const GROUP_OF: Readonly<Record<BuiltinAction, MenuGroup>> = {
  open: 'open',
  quickLook: 'open',
  details: 'open',
  download: 'get',
  rename: 'change',
  move: 'change',
  copy: 'change',
  star: 'change',
  unstar: 'change',
  trash: 'danger',
  restore: 'change',
  deleteNow: 'danger',
};

function spec(id: BuiltinAction, label: string, icon: IconName, shortcut: string | null): MenuSpec {
  const group = GROUP_OF[id];
  return { id, label, icon, shortcut, group, destructive: group === 'danger' };
}

const BUILTIN: Readonly<Record<BuiltinAction, MenuSpec>> = {
  open: spec('open', 'Open', 'externalLink', 'Enter'),
  quickLook: spec('quickLook', 'Quick look', 'eye', 'Space'),
  details: spec('details', 'Details', 'info', 'I'),
  download: spec('download', 'Download', 'download', null),
  rename: spec('rename', 'Rename', 'pencil', 'F2'),
  move: spec('move', 'Move to…', 'move', null),
  copy: spec('copy', 'Copy to…', 'copy', null),
  star: spec('star', 'Star', 'star', null),
  unstar: spec('unstar', 'Remove star', 'star', null),
  trash: spec('trash', 'Move to Trash', 'trash', 'Del'),
  restore: spec('restore', 'Restore', 'archiveRestore', null),
  deleteNow: spec('deleteNow', 'Delete for good', 'trash', 'Del'),
};

export function builtinSpecOf(action: BuiltinAction): MenuSpec {
  return BUILTIN[action];
}

export function isBuiltin(id: string): id is BuiltinAction {
  return BUILTIN_ACTIONS.some((action) => action === id);
}

export interface MenuContext {
  readonly abilities: FileAbilities;
  readonly inTrash: boolean;
}

function every(nodes: readonly FileNode[], test: (node: FileNode) => boolean): boolean {
  return nodes.length > 0 && nodes.every(test);
}

function trashActions(nodes: readonly FileNode[], abilities: FileAbilities): BuiltinAction[] {
  return [
    ...(abilities.restore && every(nodes, (node) => nodeAllows('restore', node))
      ? (['restore'] as const)
      : []),
    ...(abilities.deleteNow && every(nodes, (node) => nodeAllows('delete_now', node))
      ? (['deleteNow'] as const)
      : []),
  ];
}

function getActions(nodes: readonly FileNode[], abilities: FileAbilities): BuiltinAction[] {
  const exportable = every(nodes, (node) => node.exportable);
  const zipNeeded = nodes.length > 1 || nodes.some((node) => node.kind === 'folder');
  const download = abilities.download && exportable && (!zipNeeded || abilities.downloadZip);
  return download ? ['download'] : [];
}

function starActionOf(nodes: readonly FileNode[], abilities: FileAbilities): BuiltinAction[] {
  if (!abilities.star || nodes.length === 0) return [];
  return [nodes.every((node) => node.marks.starred) ? 'unstar' : 'star'];
}

const CHANGES: readonly (readonly [BuiltinAction, 'rename' | 'move' | 'copy'])[] = [
  ['rename', 'rename'],
  ['move', 'move'],
  ['copy', 'copy'],
];

function changeActions(nodes: readonly FileNode[], abilities: FileAbilities): BuiltinAction[] {
  const changes = CHANGES.filter(
    ([action, kind]) =>
      abilities[kind] &&
      (action !== 'rename' || nodes.length === 1) &&
      every(nodes, (node) => nodeAllows(kind, node)),
  ).map(([action]) => action);
  return [...changes, ...starActionOf(nodes, abilities)];
}

function openActions(nodes: readonly FileNode[], abilities: FileAbilities): BuiltinAction[] {
  const [only] = nodes;
  if (only === undefined || nodes.length > 1) return [];
  return [
    'open',
    ...(abilities.quickLook.includes(only.kind) ? (['quickLook'] as const) : []),
    ...(abilities.details ? (['details'] as const) : []),
  ];
}

export function builtinActionsOf(
  nodes: readonly FileNode[],
  { abilities, inTrash }: MenuContext,
): readonly BuiltinAction[] {
  if (inTrash) {
    return [
      ...(abilities.details && nodes.length === 1 ? (['details'] as const) : []),
      ...trashActions(nodes, abilities),
    ];
  }
  const trash = abilities.trash && every(nodes, (node) => nodeAllows('trash', node));
  return [
    ...openActions(nodes, abilities),
    ...getActions(nodes, abilities),
    ...changeActions(nodes, abilities),
    ...(trash ? (['trash'] as const) : []),
  ];
}

export function sourceSpecOf<O>(action: SourceActionSpec<O>): MenuSpec {
  return {
    id: action.id,
    label: action.label,
    icon: action.icon,
    shortcut: null,
    group: 'source',
    destructive: false,
  };
}

const GROUP_ORDER: readonly MenuGroup[] = ['open', 'get', 'change', 'source', 'danger'];

export function menuOf<O>(
  nodes: readonly FileNode<O>[],
  context: MenuContext,
  sourceActions: readonly SourceActionSpec<O>[],
): readonly MenuSpec[] {
  const many = nodes.length > 1;
  const specs = [
    ...builtinActionsOf(nodes, context).map(builtinSpecOf),
    ...(context.inTrash
      ? []
      : sourceActions.filter((action) => !many || action.many).map(sourceSpecOf)),
  ];
  return GROUP_ORDER.flatMap((group) => specs.filter((item) => item.group === group));
}

export function menuSectionsOf(specs: readonly MenuSpec[]): readonly (readonly MenuSpec[])[] {
  const sections: MenuSpec[][] = [];
  for (const item of specs) {
    const last = sections.at(-1);
    const sameSection =
      last?.[0] !== undefined && (last[0].group === 'danger') === (item.group === 'danger');
    if (last !== undefined && sameSection) {
      last.push(item);
    } else {
      sections.push([item]);
    }
  }
  return sections;
}

export type AreaAction = 'upload' | 'newFolder';

export interface AreaActions {
  readonly primary: AreaAction | null;
  readonly secondary: readonly AreaAction[];
}

export function areaActionsOf(abilities: FileAbilities, inTrash: boolean): AreaActions {
  if (inTrash) return { primary: null, secondary: [] };
  const all: AreaAction[] = [
    ...(abilities.upload ? (['upload'] as const) : []),
    ...(abilities.newFolder ? (['newFolder'] as const) : []),
  ];
  return { primary: all[0] ?? null, secondary: all.slice(1) };
}

export type OverflowAction = 'showHidden' | 'hideHidden' | 'enterPath';

export function overflowActionsOf(
  abilities: FileAbilities,
  showHidden: boolean,
): readonly OverflowAction[] {
  return [
    ...(abilities.hidden ? [showHidden ? ('hideHidden' as const) : ('showHidden' as const)] : []),
    ...(abilities.pathEntry ? (['enterPath'] as const) : []),
  ];
}
