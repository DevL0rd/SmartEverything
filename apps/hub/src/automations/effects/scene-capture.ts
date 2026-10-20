import {
  ApiError,
  CAPABILITY_KEY,
  type CommandAction,
  type SceneRow,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { SNAPSHOT_VALUE } from '../world-v3/snapshot';

export interface SceneCaptureRequest {
  readonly name: string;
  readonly overwrite: boolean;
  readonly actions: readonly CommandAction[];
}

export function actionsOfSnapshot(snapshot: unknown): readonly CommandAction[] {
  return Object.entries(SNAPSHOT_VALUE.parse(snapshot)).flatMap(([deviceId, values]) =>
    Object.entries(values).map(([capability, value]) => ({
      type: 'command' as const,
      deviceId,
      capability: CAPABILITY_KEY.parse(capability),
      value,
    })),
  );
}

export function captureScene(store: Pick<Store, 'scenes'>, request: SceneCaptureRequest): SceneRow {
  if (request.actions.length === 0) {
    throw new ApiError('command_refused', 'There is nothing to save as a scene.');
  }
  const scenes = store.scenes.list();
  const same = scenes.find((scene) => scene.name === request.name);
  if (same === undefined) {
    return store.scenes.create({
      name: request.name,
      icon: 'aperture',
      actions: request.actions,
      position: scenes.length,
    });
  }
  if (!request.overwrite) {
    throw new ApiError('command_refused', `A scene named ${request.name} already exists.`);
  }
  return store.scenes.update(same.id, { actions: request.actions });
}
