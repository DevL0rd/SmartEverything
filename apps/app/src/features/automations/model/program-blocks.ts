import {
  walkActions,
  type Action,
  type AutomationBlockTarget,
  type AutomationNodeId,
} from '@smarteverything/domain';

export interface ProgramBlockChoice {
  readonly value: string;
  readonly label: string;
  readonly target: AutomationBlockTarget;
}
function nestedBlocks(
  action: Action,
  label: string,
  excluded: AutomationNodeId,
): readonly ProgramBlockChoice[] {
  if (action.nodeId === excluded) return [];
  if (action.type === 'repeat')
    return blockChoices(
      action.actions,
      excluded,
      { parentId: action.nodeId, block: 'body' },
      `${label} › Repeat body`,
    );
  if (action.type !== 'choose') return [];
  return [
    ...action.branches.flatMap((branch, index) =>
      blockChoices(
        branch.actions,
        excluded,
        { parentId: action.nodeId, block: branch.nodeId },
        `${label} › Branch ${String(index + 1)}`,
      ),
    ),
    ...(action.otherwise === undefined
      ? []
      : blockChoices(
          action.otherwise,
          excluded,
          { parentId: action.nodeId, block: 'otherwise' },
          `${label} › Otherwise`,
        )),
  ];
}
function blockChoices(
  actions: readonly Action[],
  excluded: AutomationNodeId,
  target: Omit<AutomationBlockTarget, 'index'>,
  label: string,
): readonly ProgramBlockChoice[] {
  const { parentId, block } = target;
  return [
    {
      value: `${parentId ?? 'root'}:${block}`,
      label,
      target: {
        parentId,
        block,
        index: actions.filter((action) => action.nodeId !== excluded).length,
      },
    },
    ...actions.flatMap((action, index) =>
      nestedBlocks(action, `${label} › Step ${String(index + 1)}`, excluded),
    ),
  ];
}
export function programBlocks(
  actions: readonly Action[],
  excluded: AutomationNodeId,
): readonly ProgramBlockChoice[] {
  return blockChoices(actions, excluded, { parentId: null, block: 'root' }, 'Then');
}

export function actionForFocus(
  actions: readonly Action[],
  target: string | null,
): Action | undefined {
  if (target?.startsWith('node:') !== true) return undefined;
  return actions.find((entry) =>
    walkActions([entry]).some((node) => `node:${node.nodeId ?? ''}` === target),
  );
}
