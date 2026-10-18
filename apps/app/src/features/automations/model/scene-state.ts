import {
  SCENE_ACTIONS,
  accepts,
  validateCommand,
  type CommandAction,
  type JsonValue,
} from '@smarteverything/domain';
import { sceneCapabilities, type DeviceLike } from './capability-choices';
import { moved, removed, replaced } from './editor-state';
import { NAME_LIMIT } from './validate';
import { rawErrorText } from '../../../format/errors';

export interface SceneDraft {
  readonly name: string;
  readonly icon: string;
  readonly actions: readonly CommandAction[];
}

export const EMPTY_SCENE: SceneDraft = { name: '', icon: 'sparkles', actions: [] };

export type SceneChange =
  | { readonly type: 'rename'; readonly name: string }
  | { readonly type: 'icon'; readonly icon: string }
  | { readonly type: 'add'; readonly actions: readonly CommandAction[] }
  | { readonly type: 'set'; readonly index: number; readonly action: CommandAction }
  | { readonly type: 'remove'; readonly index: number }
  | { readonly type: 'move'; readonly index: number; readonly by: -1 | 1 }
  | { readonly type: 'capture'; readonly captured: readonly CommandAction[] };

function capture(draft: SceneDraft, captured: readonly CommandAction[]): SceneDraft {
  const covered = new Set(captured.map((action) => action.deviceId));
  const kept = draft.actions.filter((action) => !covered.has(action.deviceId));
  return { ...draft, actions: [...kept, ...captured] };
}

export function changeScene(draft: SceneDraft, change: SceneChange): SceneDraft {
  switch (change.type) {
    case 'rename':
      return { ...draft, name: change.name };
    case 'icon':
      return { ...draft, icon: change.icon };
    case 'add':
      return { ...draft, actions: [...draft.actions, ...change.actions] };
    case 'set':
      return { ...draft, actions: replaced(draft.actions, change.index, change.action) };
    case 'remove':
      return { ...draft, actions: removed(draft.actions, change.index) };
    case 'move':
      return { ...draft, actions: moved(draft.actions, change.index, change.by) };
    case 'capture':
      return capture(draft, change.captured);
  }
}

export function capturedActions(
  device: DeviceLike,
  values: Readonly<Record<string, { readonly value: JsonValue }>> | undefined,
): CommandAction[] {
  return sceneCapabilities(device).flatMap((capability) => {
    const current = values?.[capability.key];
    if (
      current === undefined ||
      capability.access !== 'read_write' ||
      capability.value.kind === 'action' ||
      !accepts(capability.value, current.value)
    ) {
      return [];
    }
    return [
      { type: 'command', deviceId: device.id, capability: capability.key, value: current.value },
    ];
  });
}

export type SceneReading =
  | { readonly readable: true; readonly draft: SceneDraft }
  | { readonly readable: false; readonly problem: string };

interface SceneSource {
  readonly name: string;
  readonly icon: string;
  readonly actions: unknown;
}

const readings = new WeakMap<SceneSource, SceneReading>();

function parseScene(row: SceneSource): SceneReading {
  const parsed = SCENE_ACTIONS.safeParse(row.actions);
  if (!parsed.success) {
    return {
      readable: false,
      problem: `The saved actions of ${row.name} cannot be read: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    };
  }
  return { readable: true, draft: { name: row.name, icon: row.icon, actions: parsed.data } };
}

export function readScene(row: SceneSource): SceneReading {
  const known = readings.get(row);
  if (known !== undefined) {
    return known;
  }
  const reading = parseScene(row);
  readings.set(row, reading);
  return reading;
}

export type SceneProblems = Readonly<Record<'name' | 'steps', readonly string[]>>;

export type SceneValidation =
  | { readonly valid: true; readonly scene: SceneDraft }
  | { readonly valid: false; readonly problems: SceneProblems };

function actionProblem(devices: readonly DeviceLike[], action: CommandAction): string | null {
  const device = devices.find((candidate) => candidate.id === action.deviceId);
  if (device === undefined) {
    return 'uses a device that is no longer here';
  }
  try {
    validateCommand(device, action);
    return null;
  } catch (error) {
    return rawErrorText(error);
  }
}

function duplicates(actions: readonly CommandAction[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  actions.forEach((action, index) => {
    const key = `${action.deviceId}/${action.capability}`;
    if (seen.has(key)) {
      repeated.push(`${String(index + 1)}. sets the same thing twice`);
    }
    seen.add(key);
  });
  return repeated;
}

function nameProblems(name: string): string[] {
  if (name === '') {
    return ['Give it a name.'];
  }
  return name.length > NAME_LIMIT ? [`Use at most ${String(NAME_LIMIT)} characters.`] : [];
}

function stepProblems(draft: SceneDraft, devices: readonly DeviceLike[]): string[] {
  if (draft.actions.length === 0) {
    return ['Add at least one device.'];
  }
  return [
    ...draft.actions.flatMap((action, index) => {
      const problem = actionProblem(devices, action);
      return problem === null ? [] : [`${String(index + 1)}. ${problem}`];
    }),
    ...duplicates(draft.actions),
  ];
}

export function validateScene(draft: SceneDraft, devices: readonly DeviceLike[]): SceneValidation {
  const name = draft.name.trim();
  const problems = { name: nameProblems(name), steps: stepProblems(draft, devices) };
  return problems.name.length === 0 && problems.steps.length === 0
    ? { valid: true, scene: { ...draft, name } }
    : { valid: false, problems };
}

export function reordered(
  scenes: readonly { readonly id: string }[],
  sceneId: string,
  by: -1 | 1,
): string[] | null {
  const index = scenes.findIndex((scene) => scene.id === sceneId);
  const order = moved(scenes, index, by).map((scene) => scene.id);
  return order.every((id, position) => scenes[position]?.id === id) ? null : order;
}
