import { Logger, background } from '@smarteverything/logging';
import {
  deleteAutomation,
  runAutomation,
  saveAutomation,
  setAutomationEnabled,
} from '../../../api/automations';
import { deleteScene, runScene, saveScene } from '../../../api/scenes';
import { deferAction } from '../../../components/deferred-action';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { uniqueName } from '../model/editor-state';
import type { SceneDraft } from '../model/scene-state';
import type { AutomationV2 } from '@smarteverything/domain';

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

export async function testSavedRun(automationId: string, name: string): Promise<boolean> {
  return attempt(
    `${name} didn’t run`,
    async () => {
      await runAutomation(automationId);
      notify({
        message: `${name} started`,
        tone: 'positive',
      });
    },
    { action: 'run', automationId },
  );
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

export interface SavedAutomation {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV2;
}

export function duplicateAutomation(rule: SavedAutomation, taken: readonly string[]): void {
  const name = uniqueName(rule.name, taken);
  background(
    attempt(
      'The copy wasn’t made',
      async () => {
        await saveAutomation({ automationId: null, ...rule, name });
        notify({ message: `${name} added`, tone: 'positive' });
      },
      { action: 'duplicate' },
    ),
    'actions.attempt_failed',
  );
}

export function automationKey(automationId: string): string {
  return `automation:${automationId}`;
}

export function removeAutomation(automationId: string): void {
  deferAction({
    key: automationKey(automationId),
    message: 'Automation deleted',
    failure: 'The automation wasn’t deleted',
    commit: async () => {
      const operation = log.operation('automation.delete', { automationId });
      try {
        await deleteAutomation(automationId);
        operation.succeeded();
      } catch (error) {
        operation.failed(error);
        throw error;
      }
    },
  });
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
