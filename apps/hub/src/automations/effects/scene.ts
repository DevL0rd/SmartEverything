import type { CommandAction } from '@smarteverything/domain';
import type { CommandIssuer } from '../issue-commands';
import { awaitRun } from './run-abort';
import type { CommandStamp } from './command-metadata';
import type { EffectRun } from './effect-run';

export class UnknownSceneError extends Error {
  override readonly name = 'UnknownSceneError';

  constructor(sceneId: string) {
    super(`Scene ${sceneId} does not exist in this home.`);
  }
}

export interface SceneRequest {
  readonly sceneId: string;
  readonly actions: readonly CommandAction[] | undefined;
  readonly at?: CommandStamp;
}

export async function runScene(
  issuer: Pick<CommandIssuer, 'issue'>,
  request: SceneRequest,
  run: EffectRun,
): Promise<void> {
  if (request.actions === undefined) throw new UnknownSceneError(request.sceneId);
  await awaitRun(
    issuer.issue(
      request.actions.map((action) => ({
        deviceId: action.deviceId,
        capability: action.capability,
        value: action.value,
      })),
      'scene',
      run,
      request.at === undefined ? {} : { at: request.at },
    ),
    run,
  );
}
