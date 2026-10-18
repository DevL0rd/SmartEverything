import { SCENE_ACTIONS } from '@smarteverything/domain';
import { z } from 'zod';
import { CHANGE, applyChanges } from './changes';
import { reported, waitFor } from './commanding';
import { PHYSICAL, READS, defineTool, type Tool, type ToolContext } from './registry';
import { deviceNames } from './targets';

export function scenes(context: Pick<ToolContext, 'store'>): Record<string, unknown>[] {
  const names = deviceNames(context.store);
  return context.store.scenes.list().map((scene) => {
    const actions = SCENE_ACTIONS.safeParse(scene.actions);
    return {
      id: scene.id,
      name: scene.name,
      icon: scene.icon,
      actions: actions.success
        ? actions.data.map((action) => ({
            ...action,
            device: names.get(action.deviceId) ?? action.deviceId,
          }))
        : scene.actions,
      problem: actions.success ? null : 'Its actions are not valid commands; edit the scene',
    };
  });
}

const CONTROL = z.strictObject({
  changes: z.array(CHANGE).min(1).max(50).describe('Changes, each on the devices it names'),
});

export const CONTROL_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'control_devices',
    input: CONTROL,
    annotations: PHYSICAL,
    run: (context, input) => applyChanges(context, input.changes),
  }),
  defineTool({
    name: 'run_scene',
    input: z.strictObject({ sceneId: z.uuid() }),
    annotations: PHYSICAL,
    run: async (context, input) => {
      const scene = context.store.scenes.byId(input.sceneId);
      const outcome = await waitFor(context, 'runScene', { params: { sceneId: input.sceneId } });
      return {
        structured: { scene: { id: scene.id, name: scene.name }, ...reported(context, outcome) },
      };
    },
  }),
  defineTool({
    name: 'list_scenes',
    input: z.strictObject({}),
    annotations: READS,
    run: (context) => ({ structured: { scenes: scenes(context) } }),
  }),
  defineTool({
    name: 'list_automations',
    input: z.strictObject({}),
    annotations: READS,
    run: ({ store }) => ({ structured: { automations: store.automations.list() } }),
  }),
];
