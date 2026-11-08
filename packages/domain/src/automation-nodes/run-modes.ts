import { ACTION_MODES, type ActionMode } from '../automation-v3/policy';
import type { NodeKind, NodeModes } from './define';

const ALWAYS_WAITS: NodeModes = { default: 'wait_for_result', allowed: ['wait_for_result'] };

export function modesOf(kind: Pick<NodeKind, 'effect' | 'modes'> | undefined): NodeModes {
  if (kind?.modes !== undefined) return kind.modes;
  const standard = kind?.effect?.mode;
  return standard === undefined ? ALWAYS_WAITS : { default: standard, allowed: ACTION_MODES };
}

export function hasModeChoice(kind: Pick<NodeKind, 'effect' | 'modes'> | undefined): boolean {
  return modesOf(kind).allowed.length > 1;
}

export function runModeOf(
  kind: Pick<NodeKind, 'effect' | 'modes'> | undefined,
  chosen: ActionMode | undefined,
): ActionMode {
  const modes = modesOf(kind);
  return chosen !== undefined && modes.allowed.includes(chosen) ? chosen : modes.default;
}
