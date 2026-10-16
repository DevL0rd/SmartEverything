import type { LegacyAction as Action, AutomationDefinition } from '@smarteverything/domain';
import {
  deleteAutomation,
  saveAutomation,
  sendAutomationCommands,
  setAutomationEnabled,
} from '../../../api/automations';
import { startOwnedRun } from '../../../api/automation-runtime';
import { deleteScene, runScene, saveScene } from '../../../api/scenes';
import { notify } from '../../../components/toast-store';
import { plural } from '../../../format/text';
import { uniqueName } from '../model/editor-state';
import type { SceneDraft } from '../model/scene-state';
import {
  TestRunError,
  commandCount,
  planTestRun,
  type RunnableScene,
  type Step,
} from '../model/test-run';
import type { DeviceLike } from '../model/capability-choices';

export async function attempt(failure: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    notify({
      message: failure,
      tone: 'critical',
      ...(error instanceof TestRunError ? { detail: error.message } : { error }),
    });
    return false;
  }
}

async function runStep(name: string, step: Step): Promise<void> {
  switch (step.kind) {
    case 'commands':
      await sendAutomationCommands(
        name,
        step.commands.map((command) => ({
          deviceId: command.device.id,
          capability: command.capability,
          value: command.value,
          source: command.source,
        })),
      );
      return;
    case 'notice':
      notify({ message: step.message });
      return;
    case 'skipped-wait':
    case 'skipped-ai':
      return;
  }
}

export interface TestCatalog {
  readonly devices: readonly DeviceLike[];
  readonly scenes: readonly RunnableScene[];
}

export async function testDraftRun(
  name: string,
  actions: readonly Action[],
  catalog: TestCatalog,
): Promise<boolean> {
  return attempt(`${name} didn’t run`, async () => {
    const steps = planTestRun(actions, catalog.devices, catalog.scenes);
    for (const step of steps) {
      await runStep(name, step);
    }
    notify({
      message: `${name} test sent`,
      detail: `${plural(commandCount(steps), 'command')} submitted; waits and AI steps skipped`,
      tone: 'positive',
    });
  });
}

export async function testSavedRun(automationId: string, name: string): Promise<boolean> {
  return attempt(`${name} didn’t run`, async () => {
    await startOwnedRun(automationId);
    notify({
      message: `${name} started`,
      tone: 'positive',
    });
  });
}

export function toggleAutomation(automationId: string, enabled: boolean): void {
  void attempt('The automation didn’t change', () => setAutomationEnabled(automationId, enabled));
}

export interface SavedAutomation {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationDefinition;
}

export function duplicateAutomation(rule: SavedAutomation, taken: readonly string[]): void {
  const name = uniqueName(rule.name, taken);
  void attempt('The copy wasn’t made', async () => {
    await saveAutomation({ automationId: null, ...rule, name });
    notify({ message: `${name} added`, tone: 'positive' });
  });
}

export async function removeAutomation(
  automationId: string,
  rule: SavedAutomation | null,
): Promise<boolean> {
  return attempt('The automation wasn’t deleted', async () => {
    await deleteAutomation(automationId);
    notify({
      message: 'Automation deleted',
      ...(rule === null
        ? {}
        : {
            action: {
              label: 'Undo',
              onPress: (): void => {
                void attempt('It couldn’t be restored', () =>
                  saveAutomation({ automationId: null, ...rule }),
                );
              },
            },
          }),
    });
  });
}

export function runSceneNow(scene: { readonly id: string; readonly name: string }): void {
  void attempt(`${scene.name} didn’t run`, async () => {
    const sent = await runScene(scene.id);
    notify({ message: `${scene.name} is on`, detail: plural(sent, 'command'), tone: 'positive' });
  });
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
                void attempt('It couldn’t be restored', () =>
                  saveScene({ sceneId: null, ...scene }),
                );
              },
            },
          }),
    });
  });
}
