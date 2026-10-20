import { Logger, background } from '@smarteverything/logging';
import { setAutomationEnabled } from '../../../api/automations';
import { deleteScene, runScene, saveScene } from '../../../api/scenes';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import type { SceneDraft } from '../scenes/scene-state';

const log = new Logger('app.automations');

export async function attempt(
  failure: string,
  work: () => Promise<unknown>,
  context: Readonly<Record<string, unknown>> = {},
): Promise<boolean> {
  const operation = log.operation('automation.action', context);
  try {
    await work();
    operation.succeeded();
    return true;
  } catch (error) {
    operation.failed(error, { failure });
    notify({ message: failure, tone: 'critical', error });
    return false;
  }
}

export function toggleAutomation(automationId: string, enabled: boolean): void {
  background(
    attempt('The automation didn’t change', () => setAutomationEnabled(automationId, enabled), {
      action: 'toggle',
      automationId,
      enabled,
    }),
    'actions.attempt_failed',
  );
}

export function runSceneNow(scene: { readonly id: string; readonly name: string }): void {
  background(
    attempt(
      `${scene.name} didn’t run`,
      async () => {
        const sent = await runScene(scene.id);
        log.info('scene.ran', { sceneId: scene.id, commands: sent });
        notify({
          message: `${scene.name} is on`,
          detail: plural(sent, 'command'),
          tone: 'positive',
        });
      },
      { action: 'run-scene', sceneId: scene.id },
    ),
    'actions.attempt_failed',
  );
}

export async function removeScene(
  sceneId: string,
  scene: (SceneDraft & { readonly position: number }) | null,
): Promise<boolean> {
  return attempt('The scene wasn’t deleted', async () => {
    await deleteScene(sceneId);
    notify({
      message: 'Scene deleted',
      ...(scene === null
        ? {}
        : {
            action: {
              label: 'Undo',
              onPress: (): void => {
                background(
                  attempt('It couldn’t be restored', () => saveScene({ sceneId: null, ...scene })),
                  'actions.attempt_failed',
                );
              },
            },
          }),
    });
  });
}
